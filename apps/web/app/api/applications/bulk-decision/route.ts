import { getAuthenticatedTenantIdentity } from "@jobpilot/auth/request-context";
import { decideApplication } from "@jobpilot/db/applications";
import { bulkApplicationDecisionInputSchema } from "@jobpilot/domain/application";
import { applicationSubmissionWorkflow } from "@jobpilot-workflows/application-submission";
import { start } from "workflow/api";

export async function POST(request: Request) {
  const identity = await getAuthenticatedTenantIdentity();
  if (!identity) return Response.json({ error: "Authentication is required." }, { status: 401 });
  const body = bulkApplicationDecisionInputSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return Response.json({ error: "Select between one and fifty applications." }, { status: 400 });
  }

  const results = [];
  for (const applicationId of body.data.applicationIds) {
    const result = await decideApplication({
      tenantId: identity.tenantId,
      ownerId: identity.ownerId,
      applicationId,
      decision: body.data.decision,
      reason: body.data.reason,
      requestId: `${body.data.requestId}:${applicationId}`,
    });
    if (!result) {
      results.push({ applicationId, status: "not_pending" as const });
      continue;
    }
    let workflowRunId: string | null = null;
    if (result.finalStatus === "approved" && result.submissionMode === "direct") {
      const workflow = await start(applicationSubmissionWorkflow, [
        { tenantId: identity.tenantId, ownerId: identity.ownerId, applicationId },
      ], {
        attributes: { jobpilotApplicationId: applicationId, jobpilotTenantId: identity.tenantId },
      });
      workflowRunId = workflow.runId;
    }
    results.push({ applicationId, status: result.finalStatus, workflowRunId });
  }
  return Response.json({ results });
}

