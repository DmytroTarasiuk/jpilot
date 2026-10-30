import { getAuthenticatedTenantIdentity } from "@jobpilot/auth/request-context";
import { recordWorkflowDispatch } from "@jobpilot/db/dispatcher";
import { SearchRunBudgetExceededError } from "@jobpilot/db/governance";
import { listSearchRuns, prepareManualSearchRun } from "@jobpilot/db/search-runs";
import { manualRunInputSchema } from "@jobpilot/domain/search-window";
import { searchRunWorkflow } from "@jobpilot-workflows/search-run";
import { start } from "workflow/api";

export async function GET() {
  const identity = await getAuthenticatedTenantIdentity();
  if (!identity) return Response.json({ error: "Authentication is required." }, { status: 401 });
  const runs = await listSearchRuns({ ...identity, limit: 30 });
  return Response.json({ runs });
}

export async function POST(request: Request) {
  const identity = await getAuthenticatedTenantIdentity();
  if (!identity) return Response.json({ error: "Authentication is required." }, { status: 401 });
  const body = manualRunInputSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Choose a schedule and a lookback from one to seven days." }, { status: 400 });
  let prepared: Awaited<ReturnType<typeof prepareManualSearchRun>>;
  try {
    prepared = await prepareManualSearchRun({ ...identity, ...body.data });
  } catch (error) {
    if (error instanceof SearchRunBudgetExceededError) {
      return Response.json({ error: error.message, code: error.code }, { status: 429 });
    }
    throw error;
  }
  if (!prepared) return Response.json({ error: "Schedule not found." }, { status: 404 });
  if (prepared.shouldStart) {
    const workflow = await start(searchRunWorkflow, [prepared.id], {
      attributes: { jobpilotRunId: prepared.id, jobpilotTenantId: identity.tenantId },
    });
    await recordWorkflowDispatch({ runId: prepared.id, workflowRunId: workflow.runId });
  }
  return Response.json({
    id: prepared.id,
    status: prepared.shouldStart ? "queued" : prepared.status,
    windowStart: prepared.windowStart.toISOString(),
    windowEnd: prepared.windowEnd.toISOString(),
  });
}
