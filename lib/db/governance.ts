import { and, count, eq, gte, lt, sql } from "drizzle-orm";
import { getDb, type AppDatabase } from "./client";
import {
  auditEvents,
  connectorRuntimeStates,
  notificationDeliveries,
  notifications,
  searchRuns,
  searchSchedules,
  tenantGovernancePolicies,
} from "./schema";

export const DEFAULT_GOVERNANCE_POLICY = {
  sourceSnapshotRetentionDays: 90,
  notificationRetentionDays: 180,
  auditRetentionDays: 365,
  monthlySearchRunLimit: 1_000,
  monthlyEmailLimit: 1_000,
  budgetWarningPercent: 80,
  hardStopSearchRuns: true,
} as const;

export class SearchRunBudgetExceededError extends Error {
  readonly code = "monthly_search_run_budget_exceeded";

  constructor(readonly limit: number) {
    super(`The workspace monthly search-run limit of ${limit} has been reached.`);
    this.name = "SearchRunBudgetExceededError";
  }
}

export async function getOperationalSnapshot(
  tenantId: string,
  now = new Date(),
  db: AppDatabase = getDb(),
) {
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1_000);
  const [policy, usage, [failedRuns], [overdueSchedules], [failedDeliveries], openConnectors] = await Promise.all([
    getGovernancePolicy(tenantId, db),
    getMonthlyUsage(tenantId, now, db),
    db.select({ value: count() }).from(searchRuns).where(and(eq(searchRuns.tenantId, tenantId), eq(searchRuns.status, "failed"), gte(searchRuns.createdAt, dayAgo))),
    db.select({ value: count() }).from(searchSchedules).where(and(eq(searchSchedules.tenantId, tenantId), eq(searchSchedules.enabled, true), lt(searchSchedules.nextRunAt, new Date(now.getTime() - 30 * 60 * 1_000)))),
    db.select({ value: count() }).from(notificationDeliveries).innerJoin(notifications, eq(notificationDeliveries.notificationId, notifications.id)).where(and(eq(notifications.tenantId, tenantId), eq(notificationDeliveries.status, "failed"))),
    db.select({ platform: connectorRuntimeStates.platform, circuitOpenUntil: connectorRuntimeStates.circuitOpenUntil }).from(connectorRuntimeStates).where(eq(connectorRuntimeStates.health, "open")),
  ]);
  return {
    policy,
    usage,
    health: {
      failedRuns24h: failedRuns?.value ?? 0,
      overdueSchedules: overdueSchedules?.value ?? 0,
      failedEmailDeliveries: failedDeliveries?.value ?? 0,
      openConnectors,
    },
  };
}

export async function getGovernancePolicy(
  tenantId: string,
  db: AppDatabase = getDb(),
) {
  const [stored] = await db
    .select()
    .from(tenantGovernancePolicies)
    .where(eq(tenantGovernancePolicies.tenantId, tenantId))
    .limit(1);
  return stored ?? { tenantId, ...DEFAULT_GOVERNANCE_POLICY, createdAt: null, updatedAt: null };
}

export async function updateGovernancePolicy(input: {
  tenantId: string;
  actorId: string;
  role: "owner" | "admin" | "member";
  sourceSnapshotRetentionDays: number;
  notificationRetentionDays: number;
  auditRetentionDays: number;
  monthlySearchRunLimit: number;
  monthlyEmailLimit: number;
  budgetWarningPercent: number;
  hardStopSearchRuns: boolean;
  requestId?: string | null;
  db?: AppDatabase;
}) {
  if (input.role !== "owner" && input.role !== "admin") {
    throw new Error("Workspace admin access is required.");
  }
  validatePolicy(input);
  const db = input.db ?? getDb();
  const values = {
    sourceSnapshotRetentionDays: input.sourceSnapshotRetentionDays,
    notificationRetentionDays: input.notificationRetentionDays,
    auditRetentionDays: input.auditRetentionDays,
    monthlySearchRunLimit: input.monthlySearchRunLimit,
    monthlyEmailLimit: input.monthlyEmailLimit,
    budgetWarningPercent: input.budgetWarningPercent,
    hardStopSearchRuns: input.hardStopSearchRuns,
  };
  const [policy] = await db
    .insert(tenantGovernancePolicies)
    .values({ tenantId: input.tenantId, ...values })
    .onConflictDoUpdate({
      target: tenantGovernancePolicies.tenantId,
      set: { ...values, updatedAt: new Date() },
    })
    .returning();
  await db.insert(auditEvents).values({
    tenantId: input.tenantId,
    actorType: "user",
    actorId: input.actorId,
    action: "governance.policy_updated",
    resourceType: "tenant_governance_policy",
    resourceId: input.tenantId,
    requestId: input.requestId ?? null,
    metadata: values,
  });
  return policy;
}

export async function getMonthlyUsage(
  tenantId: string,
  now = new Date(),
  db: AppDatabase = getDb(),
) {
  const { start, end } = utcMonth(now);
  const [[runs], [email]] = await Promise.all([
    db
      .select({ value: count() })
      .from(searchRuns)
      .where(
        and(
          eq(searchRuns.tenantId, tenantId),
          gte(searchRuns.createdAt, start),
          lt(searchRuns.createdAt, end),
        ),
      ),
    db
      .select({ value: count() })
      .from(notificationDeliveries)
      .innerJoin(notifications, eq(notificationDeliveries.notificationId, notifications.id))
      .where(
        and(
          eq(notifications.tenantId, tenantId),
          eq(notificationDeliveries.status, "sent"),
          gte(notificationDeliveries.sentAt, start),
          lt(notificationDeliveries.sentAt, end),
        ),
      ),
  ]);
  return { searchRuns: runs?.value ?? 0, emailsSent: email?.value ?? 0, periodStart: start, periodEnd: end };
}

export async function assertSearchRunBudget(
  tenantId: string,
  now = new Date(),
  db: AppDatabase = getDb(),
) {
  const [policy, usage] = await Promise.all([
    getGovernancePolicy(tenantId, db),
    getMonthlyUsage(tenantId, now, db),
  ]);
  if (policy.hardStopSearchRuns && usage.searchRuns >= policy.monthlySearchRunLimit) {
    throw new SearchRunBudgetExceededError(policy.monthlySearchRunLimit);
  }
  return { policy, usage };
}

export async function applyRetentionPolicies(input: {
  now?: Date;
  db?: AppDatabase;
}) {
  const db = input.db ?? getDb();
  const now = input.now ?? new Date();
  const result = await db.execute(sql<{
    deletedSnapshots: number;
    deletedNotifications: number;
    deletedAuditEvents: number;
  }>`
    WITH policies AS (
      SELECT tenant.id AS tenant_id,
        COALESCE(policy.source_snapshot_retention_days, 90) AS snapshot_days,
        COALESCE(policy.notification_retention_days, 180) AS notification_days,
        COALESCE(policy.audit_retention_days, 365) AS audit_days
      FROM tenants AS tenant
      LEFT JOIN tenant_governance_policies AS policy ON policy.tenant_id = tenant.id
    ), deleted_snapshots AS (
      DELETE FROM job_source_snapshots AS snapshot
      USING policies
      WHERE snapshot.tenant_id = policies.tenant_id
        AND snapshot.captured_at < ${now}::timestamptz - make_interval(days => policies.snapshot_days)
      RETURNING snapshot.id
    ), deleted_notifications AS (
      DELETE FROM notifications AS notification
      USING policies
      WHERE notification.tenant_id = policies.tenant_id
        AND notification.created_at < ${now}::timestamptz - make_interval(days => policies.notification_days)
      RETURNING notification.id
    ), deleted_audits AS (
      DELETE FROM audit_events AS audit
      USING policies
      WHERE audit.tenant_id = policies.tenant_id
        AND audit.created_at < ${now}::timestamptz - make_interval(days => policies.audit_days)
      RETURNING audit.id
    )
    SELECT
      (SELECT count(*)::int FROM deleted_snapshots) AS "deletedSnapshots",
      (SELECT count(*)::int FROM deleted_notifications) AS "deletedNotifications",
      (SELECT count(*)::int FROM deleted_audits) AS "deletedAuditEvents"
  `);
  return result.rows[0] ?? { deletedSnapshots: 0, deletedNotifications: 0, deletedAuditEvents: 0 };
}

export async function createBudgetAlerts(input: { now?: Date; db?: AppDatabase }) {
  const db = input.db ?? getDb();
  const now = input.now ?? new Date();
  const { start, end } = utcMonth(now);
  const month = start.toISOString().slice(0, 7);
  const result = await db.execute(sql<{ created: number }>`
    WITH usage AS (
      SELECT tenant.id AS tenant_id,
        member.user_id AS owner_id,
        COALESCE(policy.monthly_search_run_limit, 1000) AS run_limit,
        COALESCE(policy.budget_warning_percent, 80) AS warning_percent,
        (SELECT count(*)::int FROM search_runs AS run
          WHERE run.tenant_id = tenant.id
            AND run.created_at >= ${start} AND run.created_at < ${end}) AS run_count
      FROM tenants AS tenant
      JOIN tenant_members AS member ON member.tenant_id = tenant.id
        AND member.active = true AND member.role IN ('owner', 'admin')
      LEFT JOIN tenant_governance_policies AS policy ON policy.tenant_id = tenant.id
    ), inserted AS (
      INSERT INTO notifications (
        tenant_id, owner_id, type, severity, title, body, action_href, dedupe_key, metadata
      )
      SELECT tenant_id, owner_id, 'budget_warning', 'warning'::notification_severity,
        'Monthly search budget is nearly used',
        run_count || ' of ' || run_limit || ' search runs have been used this month.',
        '/operations', 'budget:search:${month}',
        jsonb_build_object('used', run_count, 'limit', run_limit, 'month', ${month})
      FROM usage
      WHERE run_count * 100 >= run_limit * warning_percent
      ON CONFLICT (tenant_id, owner_id, dedupe_key) DO NOTHING
      RETURNING id
    )
    SELECT count(*)::int AS created FROM inserted
  `);
  return result.rows[0]?.created ?? 0;
}

function utcMonth(now: Date) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start, end };
}

function validatePolicy(input: {
  sourceSnapshotRetentionDays: number;
  notificationRetentionDays: number;
  auditRetentionDays: number;
  monthlySearchRunLimit: number;
  monthlyEmailLimit: number;
  budgetWarningPercent: number;
}) {
  const rules: Array<[number, number, number, string]> = [
    [input.sourceSnapshotRetentionDays, 30, 365, "Source snapshot retention"],
    [input.notificationRetentionDays, 30, 730, "Notification retention"],
    [input.auditRetentionDays, 365, 2_555, "Audit retention"],
    [input.monthlySearchRunLimit, 1, 1_000_000, "Monthly search-run limit"],
    [input.monthlyEmailLimit, 0, 1_000_000, "Monthly email limit"],
    [input.budgetWarningPercent, 50, 100, "Budget warning threshold"],
  ];
  for (const [value, minimum, maximum, label] of rules) {
    if (!Number.isInteger(value) || value < minimum || value > maximum) {
      throw new RangeError(`${label} must be an integer from ${minimum} through ${maximum}.`);
    }
  }
}
