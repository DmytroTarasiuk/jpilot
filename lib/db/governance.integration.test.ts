import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AppDatabase } from "./client";
import { prepareClaimedSearchRun } from "./dispatcher";
import {
  applyRetentionPolicies,
  assertSearchRunBudget,
  SearchRunBudgetExceededError,
  updateGovernancePolicy,
} from "./governance";
import {
  auditEvents,
  notifications,
  searchRuns,
  searchSchedules,
  tenantMembers,
  tenants,
  users,
} from "./schema";
import * as schema from "./schema";

describe("Phase 5 governance controls", () => {
  let client: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let productionDb: AppDatabase;
  let tenantId: string;
  let ownerId: string;

  beforeEach(async () => {
    client = new PGlite();
    db = drizzle({ client, schema });
    productionDb = db as unknown as AppDatabase;
    await migrate(db, { migrationsFolder: "drizzle" });
    tenantId = randomUUID();
    ownerId = randomUUID();
    await db.insert(tenants).values({ id: tenantId, externalKey: `tenant:${tenantId}`, name: "Governance" });
    await db.insert(users).values({ id: ownerId, clerkUserId: `user:${ownerId}` });
    await db.insert(tenantMembers).values({ tenantId, userId: ownerId, role: "owner" });
  });

  afterEach(async () => {
    await client.close();
  });

  it("enforces an admin-configured monthly search budget", async () => {
    await expect(updateGovernancePolicy({
      tenantId,
      actorId: ownerId,
      role: "member",
      sourceSnapshotRetentionDays: 90,
      notificationRetentionDays: 180,
      auditRetentionDays: 365,
      monthlySearchRunLimit: 1,
      monthlyEmailLimit: 10,
      budgetWarningPercent: 80,
      hardStopSearchRuns: true,
      db: productionDb,
    })).rejects.toThrow("Workspace admin access is required");
    await updateGovernancePolicy({
      tenantId,
      actorId: ownerId,
      role: "owner",
      sourceSnapshotRetentionDays: 90,
      notificationRetentionDays: 180,
      auditRetentionDays: 365,
      monthlySearchRunLimit: 1,
      monthlyEmailLimit: 10,
      budgetWarningPercent: 80,
      hardStopSearchRuns: true,
      db: productionDb,
    });
    await db.insert(searchRuns).values({
      tenantId,
      ownerId,
      trigger: "manual",
      status: "completed",
      idempotencyKey: randomUUID(),
      scheduledFor: new Date(),
      windowStart: new Date(Date.now() - 60_000),
      windowEnd: new Date(),
    });
    await expect(assertSearchRunBudget(tenantId, new Date(), productionDb)).rejects.toBeInstanceOf(SearchRunBudgetExceededError);

    const scheduleId = randomUUID();
    const leaseToken = randomUUID();
    const scheduledFor = new Date("2026-10-30T08:00:00.000Z");
    await db.insert(searchSchedules).values({
      id: scheduleId,
      tenantId,
      ownerId,
      name: "Daily",
      idempotencyKey: randomUUID(),
      cadence: "daily",
      timezone: "Europe/Warsaw",
      localTime: "09:00",
      targetCountries: ["PL"],
      enabled: true,
      nextRunAt: scheduledFor,
      leaseToken,
      leaseExpiresAt: new Date("2026-10-30T08:30:00.000Z"),
    });
    await expect(prepareClaimedSearchRun({
      id: scheduleId,
      tenantId,
      ownerId,
      cadence: "daily",
      timezone: "Europe/Warsaw",
      localTime: "09:00",
      dayOfWeek: null,
      scheduledFor,
      leaseToken,
    }, productionDb)).resolves.toEqual({ runId: expect.any(String), shouldStart: false });
    expect(await db.select().from(searchRuns)).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: "cancelled", failureCode: "monthly_search_run_budget_exceeded" }),
    ]));
    expect(await db.select().from(searchSchedules)).toEqual([
      expect.objectContaining({ leaseToken: null, leaseExpiresAt: null }),
    ]);
  });

  it("deletes only records beyond each tenant retention window", async () => {
    const old = new Date("2024-01-01T00:00:00.000Z");
    const recent = new Date("2026-10-20T00:00:00.000Z");
    await db.insert(notifications).values([
      { tenantId, ownerId, type: "old", severity: "info", title: "old", body: "old", dedupeKey: "old", createdAt: old },
      { tenantId, ownerId, type: "recent", severity: "info", title: "recent", body: "recent", dedupeKey: "recent", createdAt: recent },
    ]);
    await db.insert(auditEvents).values([
      { tenantId, actorType: "system", actorId: "system", action: "old", resourceType: "test", resourceId: "old", createdAt: old },
      { tenantId, actorType: "system", actorId: "system", action: "recent", resourceType: "test", resourceId: "recent", createdAt: recent },
    ]);
    const result = await applyRetentionPolicies({ now: new Date("2026-10-30T00:00:00.000Z"), db: productionDb });
    expect(result).toMatchObject({ deletedNotifications: 1, deletedAuditEvents: 1 });
    expect(await db.select().from(notifications)).toEqual([expect.objectContaining({ dedupeKey: "recent" })]);
    expect(await db.select().from(auditEvents)).toEqual([expect.objectContaining({ action: "recent" })]);
  });
});
