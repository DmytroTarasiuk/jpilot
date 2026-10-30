import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { getDb, type AppDatabase } from "./client";
import {
  auditEvents,
  connectorRuntimeStates,
  jobProposals,
  searchRuns,
  supportGrants,
} from "./schema";

interface SupportAdminIdentity {
  tenantId: string;
  ownerId: string;
  role: "owner" | "admin" | "member";
}

export async function createSupportGrant(input: SupportAdminIdentity & {
  supportPrincipal: string;
  reason: string;
  durationHours: number;
}) {
  requireSupportAdmin(input.role);
  const principal = normalizePrincipal(input.supportPrincipal);
  const reason = input.reason.trim();
  if (!principal || reason.length < 8) throw new Error("A support principal and specific reason are required.");
  if (!Number.isInteger(input.durationHours) || input.durationHours < 1 || input.durationHours > 72) {
    throw new Error("Support access must expire within 1 to 72 hours.");
  }
  const db = getDb();
  const [grant] = await db
    .insert(supportGrants)
    .values({
      tenantId: input.tenantId,
      grantedBy: input.ownerId,
      supportPrincipal: principal,
      permissions: ["diagnostics:read"],
      reason,
      expiresAt: new Date(Date.now() + input.durationHours * 60 * 60 * 1_000),
    })
    .returning();
  if (!grant) throw new Error("Unable to create support access.");
  await db.insert(auditEvents).values({
    tenantId: input.tenantId,
    actorType: "user",
    actorId: input.ownerId,
    action: "support_grant.created",
    resourceType: "support_grant",
    resourceId: grant.id,
    metadata: {
      supportPrincipal: principal,
      permissions: grant.permissions,
      expiresAt: grant.expiresAt.toISOString(),
    },
  });
  return grant;
}

export async function revokeSupportGrant(input: SupportAdminIdentity & { grantId: string }) {
  requireSupportAdmin(input.role);
  const db = getDb();
  const now = new Date();
  const [grant] = await db
    .update(supportGrants)
    .set({ revokedAt: now, updatedAt: now })
    .where(and(eq(supportGrants.id, input.grantId), eq(supportGrants.tenantId, input.tenantId)))
    .returning();
  if (!grant) return null;
  await db.insert(auditEvents).values({
    tenantId: input.tenantId,
    actorType: "user",
    actorId: input.ownerId,
    action: "support_grant.revoked",
    resourceType: "support_grant",
    resourceId: grant.id,
    metadata: { supportPrincipal: grant.supportPrincipal },
  });
  return grant;
}

export async function listSupportGrants(input: SupportAdminIdentity) {
  requireSupportAdmin(input.role);
  return getDb()
    .select()
    .from(supportGrants)
    .where(eq(supportGrants.tenantId, input.tenantId))
    .orderBy(desc(supportGrants.createdAt));
}

export async function getSupportDiagnostics(input: {
  tenantId: string;
  supportPrincipal: string;
  requestId: string | null;
  db?: AppDatabase;
}) {
  const db = input.db ?? getDb();
  const now = new Date();
  const principal = normalizePrincipal(input.supportPrincipal);
  if (!principal) return null;
  const [grant] = await db
    .select()
    .from(supportGrants)
    .where(
      and(
        eq(supportGrants.tenantId, input.tenantId),
        eq(supportGrants.supportPrincipal, principal),
        isNull(supportGrants.revokedAt),
        gt(supportGrants.expiresAt, now),
        sql`${supportGrants.permissions} @> ARRAY['diagnostics:read']::text[]`,
      ),
    )
    .orderBy(desc(supportGrants.createdAt))
    .limit(1);
  if (!grant) return null;

  const [runs, proposalCount, connectors] = await Promise.all([
    db
      .select({
        id: searchRuns.id,
        status: searchRuns.status,
        counters: searchRuns.counters,
        failureCode: searchRuns.failureCode,
        startedAt: searchRuns.startedAt,
        completedAt: searchRuns.completedAt,
      })
      .from(searchRuns)
      .where(eq(searchRuns.tenantId, input.tenantId))
      .orderBy(desc(searchRuns.createdAt))
      .limit(10),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(jobProposals)
      .where(eq(jobProposals.tenantId, input.tenantId)),
    db.select().from(connectorRuntimeStates),
  ]);
  await db.insert(auditEvents).values({
    tenantId: input.tenantId,
    actorType: "system",
    actorId: `support:${principal}`,
    action: "support_diagnostics.read",
    resourceType: "tenant",
    resourceId: input.tenantId,
    requestId: input.requestId,
    metadata: { grantId: grant.id },
  });
  return {
    tenantId: input.tenantId,
    grant: { id: grant.id, expiresAt: grant.expiresAt, permissions: grant.permissions },
    proposalCount: proposalCount[0]?.count ?? 0,
    recentRuns: runs,
    connectors: connectors.map((connector) => ({
      platform: connector.platform,
      health: connector.health,
      consecutiveFailures: connector.consecutiveFailures,
      circuitOpenUntil: connector.circuitOpenUntil,
      lastSuccessAt: connector.lastSuccessAt,
      lastFailureAt: connector.lastFailureAt,
      lastFailureCode: connector.lastFailureCode,
      lastLatencyMs: connector.lastLatencyMs,
    })),
  };
}

function requireSupportAdmin(role: SupportAdminIdentity["role"]) {
  if (role !== "owner" && role !== "admin") throw new Error("Workspace admin access is required.");
}

function normalizePrincipal(value: string) {
  const principal = value.trim().toLowerCase();
  return /^[a-z0-9][a-z0-9._@+-]{2,127}$/.test(principal) ? principal : null;
}
