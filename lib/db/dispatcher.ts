import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { scheduledSearchWindow } from "../domain/search-window";
import { nextScheduleOccurrence } from "../domain/schedule";
import { getDb, type AppDatabase } from "./client";
import { assertSearchRunBudget, SearchRunBudgetExceededError } from "./governance";
import { searchRuns, searchSchedules } from "./schema";

export interface ClaimedSchedule {
  id: string;
  tenantId: string;
  ownerId: string;
  cadence: "daily" | "weekly";
  timezone: string;
  localTime: string;
  dayOfWeek: number | null;
  scheduledFor: Date;
  leaseToken: string;
}

export interface PreparedRun {
  runId: string;
  shouldStart: boolean;
}

export async function claimDueSchedules(input: { now: Date; limit: number }) {
  const leaseExpiresAt = new Date(input.now.getTime() + 30 * 60 * 1_000);
  const result = await getDb().execute(sql<ClaimedSchedule>`
    WITH due AS (
      SELECT schedule.id
      FROM search_schedules AS schedule
      WHERE schedule.enabled = true
        AND schedule.next_run_at <= ${input.now}
        AND (schedule.lease_expires_at IS NULL OR schedule.lease_expires_at < ${input.now})
        AND NOT EXISTS (
          SELECT 1
          FROM search_runs AS active_run
          WHERE active_run.schedule_id = schedule.id
            AND active_run.status IN ('leased', 'queued', 'running')
        )
      ORDER BY schedule.next_run_at ASC
      LIMIT ${input.limit}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE search_schedules AS schedule
    SET lease_token = gen_random_uuid(),
        lease_expires_at = ${leaseExpiresAt},
        updated_at = ${input.now}
    FROM due
    WHERE schedule.id = due.id
    RETURNING
      schedule.id,
      schedule.tenant_id AS "tenantId",
      schedule.owner_id AS "ownerId",
      schedule.cadence,
      schedule.timezone,
      schedule.local_time AS "localTime",
      schedule.day_of_week AS "dayOfWeek",
      schedule.next_run_at AS "scheduledFor",
      schedule.lease_token AS "leaseToken"
  `);
  return result.rows.map((row) => {
    const value = row as unknown as Omit<ClaimedSchedule, "scheduledFor"> & {
      scheduledFor: Date | string;
    };
    return {
      ...value,
      scheduledFor:
        value.scheduledFor instanceof Date ? value.scheduledFor : new Date(value.scheduledFor),
    };
  });
}

export async function prepareClaimedSearchRun(
  schedule: ClaimedSchedule,
  db: AppDatabase = getDb(),
): Promise<PreparedRun> {
  const window = scheduledSearchWindow({
    scheduledAt: schedule.scheduledFor,
    timezone: schedule.timezone,
    cadence: schedule.cadence,
  });
  const idempotencyKey = `schedule:${schedule.id}:${schedule.scheduledFor.toISOString()}`;
  const runId = randomUUID();

  const [existing] = await db
    .select({ id: searchRuns.id, status: searchRuns.status, workflowRunId: searchRuns.workflowRunId })
    .from(searchRuns)
    .where(eq(searchRuns.idempotencyKey, idempotencyKey))
    .limit(1);
  if (existing) {
    return {
      runId: existing.id,
      shouldStart: existing.status === "leased" && existing.workflowRunId === null,
    };
  }

  try {
    await assertSearchRunBudget(schedule.tenantId, new Date(), db);
  } catch (error) {
    if (!(error instanceof SearchRunBudgetExceededError)) throw error;
    await db
      .insert(searchRuns)
      .values({
        id: runId,
        tenantId: schedule.tenantId,
        ownerId: schedule.ownerId,
        scheduleId: schedule.id,
        trigger: "scheduled",
        status: "cancelled",
        idempotencyKey,
        scheduledFor: schedule.scheduledFor,
        windowStart: window.start,
        windowEnd: window.end,
        scheduleLeaseToken: schedule.leaseToken,
        failureCode: error.code,
        completedAt: new Date(),
      })
      .onConflictDoNothing({ target: searchRuns.idempotencyKey });
    const nextRunAt = nextScheduleOccurrence({
      now: schedule.scheduledFor,
      timezone: schedule.timezone,
      localTime: schedule.localTime,
      cadence: schedule.cadence,
      dayOfWeek: schedule.dayOfWeek,
    });
    await db
      .update(searchSchedules)
      .set({ nextRunAt, leaseToken: null, leaseExpiresAt: null, updatedAt: new Date() })
      .where(
        sql`${searchSchedules.id} = ${schedule.id} AND ${searchSchedules.leaseToken} = ${schedule.leaseToken}`,
      );
    const [cancelled] = await db
      .select({ id: searchRuns.id })
      .from(searchRuns)
      .where(eq(searchRuns.idempotencyKey, idempotencyKey))
      .limit(1);
    if (!cancelled) throw new Error("Unable to record the budget-cancelled search run.");
    return { runId: cancelled.id, shouldStart: false };
  }

  await db
    .insert(searchRuns)
    .values({
      id: runId,
      tenantId: schedule.tenantId,
      ownerId: schedule.ownerId,
      scheduleId: schedule.id,
      trigger: "scheduled",
      status: "leased",
      idempotencyKey,
      scheduledFor: schedule.scheduledFor,
      windowStart: window.start,
      windowEnd: window.end,
      scheduleLeaseToken: schedule.leaseToken,
    })
    .onConflictDoNothing({ target: searchRuns.idempotencyKey });

  const [run] = await db
    .select({
      id: searchRuns.id,
      status: searchRuns.status,
      workflowRunId: searchRuns.workflowRunId,
    })
    .from(searchRuns)
    .where(eq(searchRuns.idempotencyKey, idempotencyKey))
    .limit(1);
  if (!run) throw new Error("Unable to prepare the claimed search run.");
  return {
    runId: run.id,
    shouldStart: run.status === "leased" && run.workflowRunId === null,
  };
}

export async function recordWorkflowDispatch(input: { runId: string; workflowRunId: string }) {
  await getDb()
    .update(searchRuns)
    .set({
      workflowRunId: input.workflowRunId,
      status: sql`CASE WHEN ${searchRuns.status} = 'leased' THEN 'queued'::run_status ELSE ${searchRuns.status} END`,
      updatedAt: new Date(),
    })
    .where(
      sql`${searchRuns.id} = ${input.runId} AND (${searchRuns.workflowRunId} IS NULL OR ${searchRuns.workflowRunId} = ${input.workflowRunId})`,
    );
}
