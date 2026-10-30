import { FatalError, getWorkflowMetadata, RetryableError } from "workflow";
import type { PlatformKey } from "../lib/db/schema";

export async function searchRunWorkflow(runId: string) {
  "use workflow";

  const { workflowRunId } = getWorkflowMetadata();
  console.info("search workflow started", { runId, workflowRunId });
  const claimed = await claimRunStep(runId, workflowRunId);
  if (!claimed) {
    console.info("search workflow skipped because another execution owns the run", {
      runId,
      workflowRunId,
    });
    return { status: "duplicate" as const };
  }

  try {
    const capabilities = await inspectCapabilitiesStep(runId);
    const platformResults: Array<{
      platform: PlatformKey;
      status: "completed" | "failed";
      failureCode?: string;
      counters?: Record<string, number>;
    }> = [];
    for (const platform of capabilities.runnablePlatforms) {
      try {
        const counters = await discoverPlatformStep(runId, platform);
        platformResults.push({ platform, status: "completed", counters });
      } catch (error) {
        const failureCode = connectorFailureCode(error);
        await recordPlatformFailureStep(runId, platform, failureCode);
        platformResults.push({ platform, status: "failed", failureCode });
      }
    }
    const succeededPlatformCount = platformResults.filter((result) => result.status === "completed").length;
    const failedPlatformCount = platformResults.length - succeededPlatformCount;
    const finalStatus = await completeRunStep(
      runId,
      workflowRunId,
      capabilities.runnablePlatforms.length,
      succeededPlatformCount,
      failedPlatformCount,
    );
    return {
      status: finalStatus,
      ...capabilities,
      platformResults,
    };
  } catch (error) {
    await failRunStep(runId, workflowRunId);
    throw error;
  }
}

async function claimRunStep(runId: string, workflowRunId: string) {
  "use step";

  console.info("claiming search run", { runId, workflowRunId });
  const { claimSearchRunExecution } = await import("../lib/db/workflow-runs");
  return claimSearchRunExecution({ runId, workflowRunId });
}

async function inspectCapabilitiesStep(runId: string) {
  "use step";

  console.info("checking connected discovery capabilities", { runId });
  const { inspectSearchRunCapabilities } = await import("../lib/db/workflow-runs");
  return inspectSearchRunCapabilities(runId);
}

async function discoverPlatformStep(runId: string, platform: PlatformKey) {
  "use step";

  console.info("discovering and matching vacancies", { runId, platform });
  if (platform !== "djinni" && platform !== "dou") {
    throw new FatalError(`unsupported_discovery_platform:${platform}`);
  }
  const { acquireConnectorPermit, recordConnectorFailure, recordConnectorSuccess } = await import("../lib/db/connectors");
  const permit = await acquireConnectorPermit({ platform });
  if (!permit.acquired) {
    if (permit.reason === "circuit_open") {
      throw new FatalError(`connector_circuit_open:${platform}`);
    }
    throw new RetryableError(`connector_rate_limited:${platform}`, {
      retryAfter: Math.min(permit.retryAfterMs, 60_000),
    });
  }
  const startedAt = Date.now();
  try {
    const { executeDjinniDiscoveryRun, executeDouDiscoveryRun } = await import("../lib/db/discovery");
    const counters = platform === "djinni"
      ? await executeDjinniDiscoveryRun({ runId })
      : await executeDouDiscoveryRun({ runId });
    await recordConnectorSuccess({ platform, latencyMs: Date.now() - startedAt });
    console.info("discovery and matching completed", { runId, platform, counters });
    return counters;
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === "DjinniDiscoveryError" || error.name === "DouDiscoveryError")
    ) {
      const details = error as Error & { retryable?: boolean; retryAfterMs?: number };
      const state = await recordConnectorFailure({
        platform,
        failureCode: details.message,
        latencyMs: Date.now() - startedAt,
      });
      if (state?.health === "open") {
        throw new FatalError(`connector_circuit_open:${platform}:${details.message}`);
      }
      if (!details.retryable) throw new FatalError(details.message);
      if (details.retryAfterMs !== undefined) {
        throw new RetryableError(details.message, {
          retryAfter: Math.min(details.retryAfterMs, 5 * 60 * 1_000),
        });
      }
      throw new RetryableError(details.message);
    }
    throw error;
  }
}

discoverPlatformStep.maxRetries = 2;

async function completeRunStep(
  runId: string,
  workflowRunId: string,
  runnablePlatformCount: number,
  succeededPlatformCount: number,
  failedPlatformCount: number,
) {
  "use step";

  console.info("completing search run", { runId, workflowRunId, runnablePlatformCount });
  const { completeSearchRunExecution } = await import("../lib/db/workflow-runs");
  return completeSearchRunExecution({
    runId,
    workflowRunId,
    runnablePlatformCount,
    succeededPlatformCount,
    failedPlatformCount,
  });
}

async function recordPlatformFailureStep(
  runId: string,
  platform: PlatformKey,
  failureCode: string,
) {
  "use step";

  const { createConnectorAlertForRun } = await import("../lib/db/notifications");
  const { getDb } = await import("../lib/db/client");
  const { connectorRuntimeStates } = await import("../lib/db/schema");
  const { eq } = await import("drizzle-orm");
  const [state] = await getDb()
    .select({ circuitOpenUntil: connectorRuntimeStates.circuitOpenUntil })
    .from(connectorRuntimeStates)
    .where(eq(connectorRuntimeStates.platform, platform))
    .limit(1);
  return createConnectorAlertForRun({
    runId,
    platform,
    failureCode,
    circuitOpenUntil: state?.circuitOpenUntil ?? null,
  });
}

async function failRunStep(runId: string, workflowRunId: string) {
  "use step";

  console.error("search run failed after retries", { runId, workflowRunId });
  const { failSearchRunExecution } = await import("../lib/db/workflow-runs");
  return failSearchRunExecution({ runId, workflowRunId, failureCode: "workflow_step_failed" });
}

function connectorFailureCode(error: unknown) {
  return (error instanceof Error ? error.message : "connector_step_failed").slice(0, 128);
}
