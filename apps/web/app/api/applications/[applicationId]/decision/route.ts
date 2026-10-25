import { getAuthenticatedTenantIdentity } from "@jobpilot/auth/request-context";
import { decideApplication } from "@jobpilot/db/applications";
import { applicationDecisionInputSchema } from "@jobpilot/domain/application";
import { applicationSubmissionWorkflow } from "@jobpilot-workflows/application-submission";
import { start } from "workflow/api";
import { z } from "zod";

const applicationIdSchema = z.string().uuid();

export async function POST(
  request: Request,
  context: { params: Promise<{ applicationId: string }> },
) {
  const identity = await getAuthenticatedTenantIdentity();
  if (!identity) return Response.json({ error: "Authentication is required." }, { status: 401 });
  const [applicationId, body] = await Promise.all([
    context.params.then((params) => applicationIdSchema.safeParse(params.applicationId)),
    request.json().catch(() => null).then((value) => applicationDecisionInputSchema.safeParse(value)),
  ]);
  if (!applicationId.success || !body.success) {
    return Response.json({ error: "The application decision is invalid." }, { status: 400 });
  }

  const result = await decideApplication({
    tenantId: identity.tenantId,
    ownerId: identity.ownerId,
    applicationId: applicationId.data,
    ...body.data,
  });
  if (!result) {
    return Response.json(
      { error: "The approval request was not found or was already decided." },
      { status: 409 },
    );
  }

  let workflowRunId: string | null = null;
  if (result.finalStatus === "approved" && result.submissionMode === "direct") {
    const workflow = await start(applicationSubmissionWorkflow, [
      {
        tenantId: identity.tenantId,
        ownerId: identity.ownerId,
        applicationId: result.applicationId,
      },
    ], {
      attributes: {
        jobpilotApplicationId: result.applicationId,
        jobpilotTenantId: identity.tenantId,
      },
    });
    workflowRunId = workflow.runId;
  }
  return Response.json({ ...result, workflowRunId });
}

