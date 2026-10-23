import { getWorkflowMetadata } from "workflow";

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
    await completeRunStep(runId, workflowRunId, capabilities.runnablePlatforms.length);
    return {
      status: capabilities.runnablePlatforms.length === 0 ? ("waiting_for_integration" as const) : ("completed" as const),
      ...capabilities,
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
