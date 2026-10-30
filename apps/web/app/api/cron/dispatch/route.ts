import { isAuthorizedCronRequest } from "@jobpilot/auth/cron";
import { claimDueSchedules, prepareClaimedSearchRun, recordWorkflowDispatch } from "@jobpilot/db/dispatcher";
import { applyRetentionPolicies, createBudgetAlerts } from "@jobpilot/db/governance";
import { dispatchPendingEmailNotifications } from "@jobpilot/db/notifications";
import { searchRunWorkflow } from "@jobpilot-workflows/search-run";
import { start } from "workflow/api";

async function dispatchDueSchedules(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const claimed = await claimDueSchedules({ now: new Date(), limit: 25 });
  const started: Array<{ runId: string; workflowRunId: string }> = [];
  for (const schedule of claimed) {
    const prepared = await prepareClaimedSearchRun(schedule);
    if (!prepared.shouldStart) continue;

    const workflow = await start(searchRunWorkflow, [prepared.runId], {
      attributes: {
        jobpilotRunId: prepared.runId,
        jobpilotTenantId: schedule.tenantId,
      },
    });
    await recordWorkflowDispatch({ runId: prepared.runId, workflowRunId: workflow.runId });
    started.push({ runId: prepared.runId, workflowRunId: workflow.runId });
  }
  const email = await dispatchPendingEmailNotifications({ limit: 25 });
  const governance = await runGovernanceMaintenance();
  return Response.json({ claimed: claimed.length, started, email, governance });
}

async function runGovernanceMaintenance() {
  try {
    const [retention, budgetAlertsCreated] = await Promise.all([
      applyRetentionPolicies({}),
      createBudgetAlerts({}),
    ]);
    return { retention, budgetAlertsCreated };
  } catch (error) {
    console.error("governance maintenance failed", { error });
    return { failureCode: "governance_maintenance_failed" };
  }
}

export const GET = dispatchDueSchedules;
export const POST = dispatchDueSchedules;
