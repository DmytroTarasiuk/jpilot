import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { implementedDiscoveryPlatforms } from "../domain/platform-catalog";
import { nextScheduleOccurrence } from "../domain/schedule";
import { getDb } from "./client";
import {
  platformIntegrations,
  schedulePlatforms,
  searchRuns,
  searchSchedules,
} from "./schema";

export async function claimSearchRunExecution(input: {
  runId: string;
  workflowRunId: string;
}) {
  const [run] = await getDb()
    .update(searchRuns)
    .set({ workflowRunId: input.workflowRunId, status: "running", startedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(searchRuns.id, input.runId),
        inArray(searchRuns.status, ["leased", "queued", "running"]),
        or(eq(searchRuns.workflowRunId, input.workflowRunId), isNull(searchRuns.workflowRunId)),
      ),
    )
    .returning({ id: searchRuns.id });
  return run !== undefined;
}

export async function inspectSearchRunCapabilities(runId: string) {
  const [run] = await getDb()
    .select({
      tenantId: searchRuns.tenantId,
      ownerId: searchRuns.ownerId,
      scheduleId: searchRuns.scheduleId,
    })
    .from(searchRuns)
    .where(eq(searchRuns.id, runId))
    .limit(1);
  if (!run?.scheduleId) throw new Error("Scheduled search run was not found.");

  const selected = await getDb()
    .select({ platform: schedulePlatforms.platform })
    .from(schedulePlatforms)
    .where(and(eq(schedulePlatforms.scheduleId, run.scheduleId), eq(schedulePlatforms.enabled, true)));
  const connected = await getDb()
    .select({
      platform: platformIntegrations.platform,
      capabilities: platformIntegrations.capabilities,
    })
    .from(platformIntegrations)
    .where(
      and(
        eq(platformIntegrations.tenantId, run.tenantId),
        eq(platformIntegrations.ownerId, run.ownerId),
        eq(platformIntegrations.status, "connected"),
      ),
    );
  const connectedDiscovery = new Set(
    connected.filter((integration) => integration.capabilities.discover).map((integration) => integration.platform),
  );
  return {
    selectedPlatforms: selected.map((item) => item.platform),
    runnablePlatforms: selected
      .map((item) => item.platform)
      .filter(
        (platform) =>
          connectedDiscovery.has(platform) && implementedDiscoveryPlatforms.has(platform),
      ),
  };
}

export async function completeSearchRunExecution(input: {
  runId: string;
  workflowRunId: string;
  runnablePlatformCount: number;
  succeededPlatformCount: number;
  failedPlatformCount: number;
}) {
  const outcome = deriveRunOutcome(input);
  await finalizeRun({
    runId: input.runId,
    workflowRunId: input.workflowRunId,
    status: outcome.status,
    failureCode: outcome.failureCode,
    scheduleDisposition: outcome.scheduleDisposition,
  });
  return outcome.workflowStatus;
}

export function deriveRunOutcome(input: {
  runnablePlatformCount: number;
  succeededPlatformCount: number;
  failedPlatformCount: number;
}) {
  if (input.runnablePlatformCount === 0) {
    return {
      status: "partially_completed" as const,
      workflowStatus: "waiting_for_integration" as const,
      failureCode: "no_connected_discovery_integrations",
      scheduleDisposition: "pause" as const,
    };
  }
  if (input.failedPlatformCount === 0) {
    return {
      status: "completed" as const,
      workflowStatus: "completed" as const,
      failureCode: null,
      scheduleDisposition: "advance" as const,
    };
  }
  const status = input.succeededPlatformCount > 0 ? "partially_completed" as const : "failed" as const;
  return {
    status,
    workflowStatus: status,
    failureCode: "connector_failure",
    scheduleDisposition: "advance" as const,
  };
}

export async function failSearchRunExecution(input: {
  runId: string;
  workflowRunId: string;
  failureCode: string;
}) {
  return finalizeRun({ ...input, status: "failed", scheduleDisposition: "pause" });
}

async function finalizeRun(input: {
  runId: string;
  workflowRunId: string;
  status: "completed" | "partially_completed" | "failed";
  failureCode: string | null;
  scheduleDisposition: "advance" | "pause";
}) {
  const db = getDb();
  const [run] = await db
    .select()
    .from(searchRuns)
    .where(and(eq(searchRuns.id, input.runId), eq(searchRuns.workflowRunId, input.workflowRunId)))
    .limit(1);
  if (!run) return false;

  const counters =
    input.status === "failed"
      ? { ...run.counters, failed: Math.max(1, run.counters.failed ?? 0) }
      : run.counters;

  await db
    .update(searchRuns)
    .set({
      status: input.status,
      failureCode: input.failureCode,
      counters,
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(searchRuns.id, input.runId), eq(searchRuns.workflowRunId, input.workflowRunId)));

  if (!run.scheduleId || !run.scheduleLeaseToken) {
    await createSummaryNotification(input.runId);
    return true;
  }
  const [schedule] = await db
    .select()
    .from(searchSchedules)
    .where(
      and(
        eq(searchSchedules.id, run.scheduleId),
        eq(searchSchedules.leaseToken, run.scheduleLeaseToken),
      ),
    )
    .limit(1);
  if (!schedule) {
    await createSummaryNotification(input.runId);
    return true;
  }

  if (input.scheduleDisposition === "pause") {
    await db
      .update(searchSchedules)
      .set({ enabled: false, leaseToken: null, leaseExpiresAt: null, updatedAt: new Date() })
      .where(
        and(
          eq(searchSchedules.id, schedule.id),
          eq(searchSchedules.leaseToken, run.scheduleLeaseToken),
        ),
      );
    await createSummaryNotification(input.runId);
    return true;
  }

  const nextRunAt = nextScheduleOccurrence({
    now: run.scheduledFor,
    timezone: schedule.timezone,
    localTime: schedule.localTime,
    cadence: schedule.cadence,
    dayOfWeek: schedule.dayOfWeek,
  });
  await db
    .update(searchSchedules)
    .set({
      nextRunAt,
      lastSuccessfulWindowEnd: run.windowEnd,
      leaseToken: null,
      leaseExpiresAt: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(searchSchedules.id, schedule.id),
        eq(searchSchedules.leaseToken, run.scheduleLeaseToken),
      ),
    );
  await createSummaryNotification(input.runId);
  return true;
}

async function createSummaryNotification(runId: string) {
  try {
    const { createRunSummaryNotification } = await import("./notifications");
    await createRunSummaryNotification({ runId });
  } catch (error) {
    console.error("run summary notification could not be created", { runId, error });
  }
}
