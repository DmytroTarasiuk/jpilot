import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppDatabase } from "./client";
import { createRunSummaryNotification, dispatchPendingEmailNotifications } from "./notifications";
import { getSupportDiagnostics } from "./support";
import {
  auditEvents,
  notificationDeliveries,
  notificationPreferences,
  notifications,
  searchRuns,
  supportGrants,
  tenants,
  users,
} from "./schema";
import * as schema from "./schema";

describe("Phase 4 operational controls", () => {
  let client: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let tenantId: string;
  let ownerId: string;

  beforeEach(async () => {
    client = new PGlite();
    db = drizzle({ client, schema });
    await migrate(db, { migrationsFolder: "drizzle" });
    tenantId = randomUUID();
    ownerId = randomUUID();
    await db.insert(tenants).values({ id: tenantId, externalKey: `tenant:${tenantId}`, name: "Operations" });
    await db.insert(users).values({ id: ownerId, clerkUserId: `user_${ownerId}` });
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await client.close();
  });

  it("creates one in-app summary and delivers one idempotent email", async () => {
    const runId = randomUUID();
    await db.insert(searchRuns).values({
      id: runId,
      tenantId,
      ownerId,
      trigger: "manual",
      status: "completed",
      idempotencyKey: `run:${runId}`,
      scheduledFor: new Date("2026-10-30T08:00:00.000Z"),
      windowStart: new Date("2026-10-29T00:00:00.000Z"),
      windowEnd: new Date("2026-10-30T00:00:00.000Z"),
      counters: { found: 5, new: 4, duplicate: 1, eligible: 3, proposed: 2, failed: 0 },
    });
    await db.insert(notificationPreferences).values({
      tenantId,
      ownerId,
      emailEnabled: true,
      emailAddress: "candidate@example.com",
    });
    const productionDb = db as unknown as AppDatabase;
    await createRunSummaryNotification({ runId, db: productionDb });
    await createRunSummaryNotification({ runId, db: productionDb });
    expect(await db.select().from(notifications)).toHaveLength(1);
    expect(await db.select().from(notificationDeliveries)).toHaveLength(1);

    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("NOTIFICATION_EMAIL_FROM", "JobPilot <notifications@example.com>");
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({ "idempotency-key": `jobpilot-notification/${(await db.select().from(notifications))[0]!.id}` });
      return Response.json({ id: "email_123" });
    }) as unknown as typeof fetch;
    expect(await dispatchPendingEmailNotifications({ db: productionDb, fetchImpl })).toEqual({
      configured: true,
      claimed: 1,
      sent: 1,
      failed: 0,
    });
    expect(await db.select().from(notificationDeliveries)).toEqual([
      expect.objectContaining({ status: "sent", attemptCount: 1, providerMessageId: "email_123" }),
    ]);
  });

  it("requires a live tenant-scoped grant and audits sanitized diagnostics reads", async () => {
    const grantId = randomUUID();
    await db.insert(supportGrants).values({
      id: grantId,
      tenantId,
      grantedBy: ownerId,
      supportPrincipal: "support@example.com",
      permissions: ["diagnostics:read"],
      reason: "Investigate connector health",
      expiresAt: new Date(Date.now() + 60 * 60 * 1_000),
    });
    const productionDb = db as unknown as AppDatabase;
    const diagnostics = await getSupportDiagnostics({
      tenantId,
      supportPrincipal: "support@example.com",
      requestId: "request-1",
      db: productionDb,
    });
    expect(diagnostics).toMatchObject({
      tenantId,
      grant: { id: grantId, permissions: ["diagnostics:read"] },
      proposalCount: 0,
      recentRuns: [],
    });
    expect(diagnostics).not.toHaveProperty("cvDocuments");
    expect(await db.select().from(auditEvents)).toEqual([
      expect.objectContaining({
        tenantId,
        actorId: "support:support@example.com",
        action: "support_diagnostics.read",
        requestId: "request-1",
      }),
    ]);
    await db.update(supportGrants).set({ revokedAt: new Date() }).where(eq(supportGrants.id, grantId));
    expect(await getSupportDiagnostics({
      tenantId,
      supportPrincipal: "support@example.com",
      requestId: "request-2",
      db: productionDb,
    })).toBeNull();
    expect(await getSupportDiagnostics({
      tenantId: randomUUID(),
      supportPrincipal: "support@example.com",
      requestId: "request-3",
      db: productionDb,
    })).toBeNull();
  });
});
