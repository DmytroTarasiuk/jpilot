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
    const platformResults = [];
    for (const platform of capabilities.runnablePlatforms) {
      platformResults.push(await discoverPlatformStep(runId, platform));
    }
    await completeRunStep(runId, workflowRunId, capabilities.runnablePlatforms.length);
    return {
      status: capabilities.runnablePlatforms.length === 0 ? ("waiting_for_integration" as const) : ("completed" as const),
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
  if (platform !== "djinni") throw new FatalError(`unsupported_discovery_platform:${platform}`);
  try {
    const { executeDjinniDiscoveryRun } = await import("../lib/db/discovery");
    return await executeDjinniDiscoveryRun({ runId });
  } catch (error) {
    if (error instanceof Error && error.name === "DjinniDiscoveryError") {
      const details = error as Error & { retryable?: boolean; retryAfterMs?: number };
      if (!details.retryable) throw new FatalError(details.message);
      if (details.retryAfterMs !== undefined) {
        throw new RetryableError(details.message, {
          retryAfter: Math.min(details.retryAfterMs, 5 * 60 * 1_000),
        });
      }
    }
    throw error;
  }
}

discoverPlatformStep.maxRetries = 2;

async function completeRunStep(runId: string, workflowRunId: string, runnablePlatformCount: number) {
  "use step";

  console.info("completing search run", { runId, workflowRunId, runnablePlatformCount });
  const { completeSearchRunExecution } = await import("../lib/db/workflow-runs");
  return completeSearchRunExecution({ runId, workflowRunId, runnablePlatformCount });
}

async function failRunStep(runId: string, workflowRunId: string) {
  "use step";

  console.error("search run failed after retries", { runId, workflowRunId });
  const { failSearchRunExecution } = await import("../lib/db/workflow-runs");
  return failSearchRunExecution({ runId, workflowRunId, failureCode: "workflow_step_failed" });
}
