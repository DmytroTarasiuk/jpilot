import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { manualSearchWindow } from "../domain/search-window";
import { getDb } from "./client";
import { assertSearchRunBudget } from "./governance";
import { searchRuns, searchSchedules } from "./schema";

export async function prepareManualSearchRun(input: {
  tenantId: string;
  ownerId: string;
  scheduleId: string;
  requestId: string;
  lookbackDays: number;
  now?: Date;
}) {
  const db = getDb();
  const [schedule] = await db
    .select()
    .from(searchSchedules)
    .where(
      and(
        eq(searchSchedules.id, input.scheduleId),
        eq(searchSchedules.tenantId, input.tenantId),
        eq(searchSchedules.ownerId, input.ownerId),
      ),
    )
    .limit(1);
  if (!schedule) return null;

  const requestedAt = input.now ?? new Date();
  const idempotencyKey = `${input.tenantId}:${input.ownerId}:manual-run:${input.requestId}`;
  const [existing] = await db
    .select({
      id: searchRuns.id,
      status: searchRuns.status,
      workflowRunId: searchRuns.workflowRunId,
      windowStart: searchRuns.windowStart,
      windowEnd: searchRuns.windowEnd,
    })
    .from(searchRuns)
    .where(eq(searchRuns.idempotencyKey, idempotencyKey))
    .limit(1);
  if (existing) {
    return {
      ...existing,
      shouldStart: existing.status === "leased" && existing.workflowRunId === null,
    };
  }
  await assertSearchRunBudget(input.tenantId, requestedAt, db);
  const window = manualSearchWindow({
    requestedAt,
    timezone: schedule.timezone,
    lookbackDays: input.lookbackDays,
  });
  const runId = randomUUID();
  await db
    .insert(searchRuns)
    .values({
      id: runId,
      tenantId: input.tenantId,
      ownerId: input.ownerId,
      scheduleId: schedule.id,
      trigger: "manual",
      status: "leased",
      idempotencyKey,
      scheduledFor: requestedAt,
      windowStart: window.start,
      windowEnd: window.end,
    })
    .onConflictDoNothing({ target: searchRuns.idempotencyKey });
  const [run] = await db
    .select({
      id: searchRuns.id,
      status: searchRuns.status,
      workflowRunId: searchRuns.workflowRunId,
      windowStart: searchRuns.windowStart,
      windowEnd: searchRuns.windowEnd,
    })
    .from(searchRuns)
    .where(eq(searchRuns.idempotencyKey, idempotencyKey))
    .limit(1);
  if (!run) throw new Error("Unable to prepare the manual search run.");
  return {
    ...run,
    shouldStart: run.status === "leased" && run.workflowRunId === null,
  };
}

export async function listSearchRuns(input: {
  tenantId: string;
  ownerId: string;
  limit?: number;
}) {
  return getDb()
    .select({
      id: searchRuns.id,
      scheduleId: searchRuns.scheduleId,
      scheduleName: searchSchedules.name,
      trigger: searchRuns.trigger,
      status: searchRuns.status,
      windowStart: searchRuns.windowStart,
      windowEnd: searchRuns.windowEnd,
      counters: searchRuns.counters,
      failureCode: searchRuns.failureCode,
      createdAt: searchRuns.createdAt,
      completedAt: searchRuns.completedAt,
    })
    .from(searchRuns)
    .leftJoin(searchSchedules, eq(searchRuns.scheduleId, searchSchedules.id))
    .where(
      and(
        eq(searchRuns.tenantId, input.tenantId),
        eq(searchRuns.ownerId, input.ownerId),
      ),
    )
    .orderBy(desc(searchRuns.createdAt))
    .limit(input.limit ?? 30);
}
