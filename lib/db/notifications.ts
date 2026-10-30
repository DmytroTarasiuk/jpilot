import { and, desc, eq, sql } from "drizzle-orm";
import { getEmailDeliveryEnvironment } from "../env/server";
import { getDb, type AppDatabase } from "./client";
import { getGovernancePolicy, getMonthlyUsage } from "./governance";
import {
  notificationDeliveries,
  notificationPreferences,
  notifications,
  searchRuns,
  type PlatformKey,
} from "./schema";

interface OwnedIdentity {
  tenantId: string;
  ownerId: string;
}

interface NotificationInput extends OwnedIdentity {
  type: string;
  severity: "info" | "warning" | "error";
  title: string;
  body: string;
  actionHref?: string | null;
  dedupeKey: string;
  metadata?: Record<string, unknown>;
}

export async function createRunSummaryNotification(
  input: { runId: string; db?: AppDatabase },
) {
  const db = input.db ?? getDb();
  const [run] = await db
    .select()
    .from(searchRuns)
    .where(eq(searchRuns.id, input.runId))
    .limit(1);
  if (!run) return null;
  const statusLabel = run.status.replaceAll("_", " ");
  const proposed = run.counters.proposed ?? 0;
  const failed = run.counters.failed ?? 0;
  return createNotification(db, {
    tenantId: run.tenantId,
    ownerId: run.ownerId,
    type: "run_summary",
    severity: run.status === "failed" ? "error" : run.status === "partially_completed" ? "warning" : "info",
    title: `Search ${statusLabel}`,
    body: `${proposed} role${proposed === 1 ? "" : "s"} proposed, ${run.counters.eligible ?? 0} eligible, and ${failed} failed item${failed === 1 ? "" : "s"}.`,
    actionHref: "/dashboard",
    dedupeKey: `run:${run.id}:summary`,
    metadata: { runId: run.id, status: run.status, counters: run.counters },
  });
}

export async function createConnectorAlert(input: OwnedIdentity & {
  runId: string;
  platform: PlatformKey;
  failureCode: string;
  circuitOpenUntil?: Date | null;
  db?: AppDatabase;
}) {
  const db = input.db ?? getDb();
  const platformName = input.platform === "dou" ? "DOU" : input.platform === "djinni" ? "Djinni" : input.platform;
  const circuit = input.circuitOpenUntil
    ? ` Automatic retries are paused until ${input.circuitOpenUntil.toISOString()}.`
    : " The other connected sources continued independently.";
  return createNotification(db, {
    tenantId: input.tenantId,
    ownerId: input.ownerId,
    type: "connector_failure",
    severity: input.circuitOpenUntil ? "error" : "warning",
    title: `${platformName} connector needs attention`,
    body: `The source reported ${input.failureCode}.${circuit}`,
    actionHref: "/integrations",
    dedupeKey: `run:${input.runId}:connector:${input.platform}`,
    metadata: {
      runId: input.runId,
      platform: input.platform,
      failureCode: input.failureCode,
      circuitOpenUntil: input.circuitOpenUntil?.toISOString() ?? null,
    },
  });
}

export async function createConnectorAlertForRun(input: {
  runId: string;
  platform: PlatformKey;
  failureCode: string;
  circuitOpenUntil?: Date | null;
  db?: AppDatabase;
}) {
  const db = input.db ?? getDb();
  const [run] = await db
    .select({ tenantId: searchRuns.tenantId, ownerId: searchRuns.ownerId })
    .from(searchRuns)
    .where(eq(searchRuns.id, input.runId))
    .limit(1);
  if (!run) return null;
  return createConnectorAlert({ ...input, ...run, db });
}

export async function listOwnedNotifications(input: OwnedIdentity & { limit?: number }) {
  return getDb()
    .select()
    .from(notifications)
    .where(and(eq(notifications.tenantId, input.tenantId), eq(notifications.ownerId, input.ownerId)))
    .orderBy(desc(notifications.createdAt))
    .limit(Math.min(Math.max(input.limit ?? 50, 1), 100));
}

export async function markOwnedNotificationRead(input: OwnedIdentity & { notificationId: string }) {
  const [updated] = await getDb()
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.id, input.notificationId),
        eq(notifications.tenantId, input.tenantId),
        eq(notifications.ownerId, input.ownerId),
      ),
    )
    .returning({ id: notifications.id });
  return updated ?? null;
}

export async function getNotificationPreferences(input: OwnedIdentity) {
  const [preferences] = await getDb()
    .select()
    .from(notificationPreferences)
    .where(
      and(
        eq(notificationPreferences.tenantId, input.tenantId),
        eq(notificationPreferences.ownerId, input.ownerId),
      ),
    )
    .limit(1);
  return {
    emailEnabled: preferences?.emailEnabled ?? false,
    emailAddress: preferences?.emailAddress ?? null,
    emailTransportConfigured: getEmailDeliveryEnvironment() !== null,
  };
}

export async function updateNotificationPreferences(input: OwnedIdentity & {
  emailEnabled: boolean;
  emailAddress: string | null;
}) {
  const emailAddress = normalizeEmail(input.emailAddress);
  if (input.emailEnabled && !emailAddress) throw new Error("A valid email address is required.");
  const [preferences] = await getDb()
    .insert(notificationPreferences)
    .values({ ...input, emailAddress })
    .onConflictDoUpdate({
      target: [notificationPreferences.tenantId, notificationPreferences.ownerId],
      set: { emailEnabled: input.emailEnabled, emailAddress, updatedAt: new Date() },
    })
    .returning();
  return preferences;
}

export async function dispatchPendingEmailNotifications(input: {
  limit?: number;
  fetchImpl?: typeof fetch;
  db?: AppDatabase;
}) {
  const environment = getEmailDeliveryEnvironment();
  if (!environment) return { configured: false, claimed: 0, sent: 0, failed: 0 };
  const db = input.db ?? getDb();
  const now = new Date();
  const result = await db.execute(sql<{
    id: string;
    notificationId: string;
    destination: string;
    title: string;
    body: string;
    actionHref: string | null;
    tenantId: string;
  }>`
    WITH due AS (
      SELECT delivery.id
      FROM notification_deliveries AS delivery
      WHERE (
          (delivery.status IN ('pending', 'failed') AND delivery.next_attempt_at <= ${now})
          OR (delivery.status = 'sending' AND delivery.updated_at < ${new Date(now.getTime() - 15 * 60 * 1_000)})
        )
        AND delivery.attempt_count < 5
      ORDER BY delivery.next_attempt_at ASC
      LIMIT ${Math.min(Math.max(input.limit ?? 25, 1), 100)}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE notification_deliveries AS delivery
    SET status = 'sending'::notification_delivery_status,
        attempt_count = delivery.attempt_count + 1,
        updated_at = ${now}
    FROM due, notifications AS notification
    WHERE delivery.id = due.id
      AND notification.id = delivery.notification_id
    RETURNING delivery.id,
      delivery.notification_id AS "notificationId",
      delivery.destination,
      notification.title,
      notification.body,
      notification.action_href AS "actionHref",
      notification.tenant_id AS "tenantId"
  `);
  const deliveries = result.rows as Array<{
    id: string;
    notificationId: string;
    destination: string;
    title: string;
    body: string;
    actionHref: string | null;
    tenantId: string;
  }>;
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  const emailBudgets = new Map<string, { limit: number; used: number }>();
  for (const delivery of deliveries) {
    let budget = emailBudgets.get(delivery.tenantId);
    if (!budget) {
      const [policy, usage] = await Promise.all([
        getGovernancePolicy(delivery.tenantId, db),
        getMonthlyUsage(delivery.tenantId, now, db),
      ]);
      budget = { limit: policy.monthlyEmailLimit, used: usage.emailsSent };
      emailBudgets.set(delivery.tenantId, budget);
    }
    if (budget.used >= budget.limit) {
      await db
        .update(notificationDeliveries)
        .set({ status: "skipped", failureCode: "monthly_email_budget_exceeded", updatedAt: new Date() })
        .where(eq(notificationDeliveries.id, delivery.id));
      skipped += 1;
      continue;
    }
    try {
      const response = await (input.fetchImpl ?? fetch)("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          authorization: `Bearer ${environment.RESEND_API_KEY}`,
          "content-type": "application/json",
          "idempotency-key": `jobpilot-notification/${delivery.notificationId}`,
        },
        body: JSON.stringify({
          from: environment.NOTIFICATION_EMAIL_FROM,
          to: [delivery.destination],
          subject: delivery.title,
          html: renderEmailHtml(delivery.title, delivery.body, delivery.actionHref),
        }),
      });
      if (!response.ok) throw new Error(`resend_http_${response.status}`);
      const payload = await response.json().catch(() => null) as { id?: string } | null;
      await db
        .update(notificationDeliveries)
        .set({ status: "sent", providerMessageId: payload?.id ?? null, failureCode: null, sentAt: new Date(), updatedAt: new Date() })
        .where(eq(notificationDeliveries.id, delivery.id));
      sent += 1;
      budget.used += 1;
    } catch (error) {
      const failureCode = error instanceof Error ? error.message : "email_delivery_failed";
      await db
        .update(notificationDeliveries)
        .set({
          status: "failed",
          failureCode: failureCode.slice(0, 128),
          nextAttemptAt: new Date(Date.now() + 15 * 60 * 1_000),
          updatedAt: new Date(),
        })
        .where(eq(notificationDeliveries.id, delivery.id));
      failed += 1;
    }
  }
  return { configured: true, claimed: deliveries.length, sent, failed, skipped };
}

async function createNotification(db: AppDatabase, input: NotificationInput) {
  const [created] = await db
    .insert(notifications)
    .values(input)
    .onConflictDoNothing({
      target: [notifications.tenantId, notifications.ownerId, notifications.dedupeKey],
    })
    .returning();
  if (!created) return null;
  const [preferences] = await db
    .select()
    .from(notificationPreferences)
    .where(
      and(
        eq(notificationPreferences.tenantId, input.tenantId),
        eq(notificationPreferences.ownerId, input.ownerId),
        eq(notificationPreferences.emailEnabled, true),
      ),
    )
    .limit(1);
  if (preferences?.emailAddress) {
    await db.insert(notificationDeliveries).values({
      notificationId: created.id,
      channel: "email",
      destination: preferences.emailAddress,
    });
  }
  return created;
}

function normalizeEmail(value: string | null) {
  const normalized = value?.trim().toLowerCase() ?? "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : null;
}

function renderEmailHtml(title: string, body: string, actionHref: string | null) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";
  const href = actionHref && appUrl ? `${appUrl}${actionHref}` : null;
  return `<main style="font-family:system-ui,sans-serif;max-width:560px;margin:auto"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(body)}</p>${href ? `<p><a href="${escapeHtml(href)}">Open JobPilot</a></p>` : ""}<p style="color:#68776f;font-size:12px">You enabled JobPilot email notifications in your account.</p></main>`;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character]!);
}
