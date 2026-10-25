import { defineTool } from "eve/tools";
import { always } from "eve/tools/approval";
import { start } from "workflow/api";
import { z } from "zod";
import { decideApplication } from "../../lib/db/applications";
import { applicationSubmissionWorkflow } from "../../workflows/application-submission";

export default defineTool({
  description:
    "Approve or reject one pending JobPilot application. Approval prepares a manual application task unless a permitted direct-submit adapter is explicitly enabled. Never describe the application as submitted based on this tool.",
  inputSchema: z.object({
    applicationId: z.string().uuid(),
    decision: z.enum(["approve", "reject"]),
    reason: z.string().trim().max(1_000).optional(),
  }),
  approval: {
    request: always(),
    prompt: ({ input }) =>
      `${input.decision === "approve" ? "Approve" : "Reject"} application ${input.applicationId}?`,
  },
  async execute(input, ctx) {
    const identity = runtimeIdentity(ctx.session.auth.current);
    const result = await decideApplication({
      ...identity,
      applicationId: input.applicationId,
      decision: input.decision,
      reason: input.reason,
      requestId: `eve:${ctx.session.id}:${crypto.randomUUID()}`,
      actorType: "user",
    });
    if (!result) {
      return { changed: false, reason: "The request is missing, already decided, or inaccessible." };
    }
    let workflowRunId: string | null = null;
    if (result.finalStatus === "approved" && result.submissionMode === "direct") {
      const workflow = await start(applicationSubmissionWorkflow, [
        { ...identity, applicationId: result.applicationId },
      ], {
        attributes: {
          jobpilotApplicationId: result.applicationId,
          jobpilotTenantId: identity.tenantId,
        },
      });
      workflowRunId = workflow.runId;
    }
    return {
      changed: true,
      applicationId: result.applicationId,
      status: result.finalStatus,
      submissionMode: result.submissionMode,
      workflowRunId,
      submitted: false,
    };
  },
});

function runtimeIdentity(auth: { attributes?: Record<string, unknown> } | null | undefined) {
  const tenantId = auth?.attributes?.tenantId;
  const ownerId = auth?.attributes?.appUserId;
  if (typeof tenantId !== "string" || typeof ownerId !== "string") {
    throw new Error("Authenticated tenant context is required.");
  }
  return { tenantId, ownerId };
}

