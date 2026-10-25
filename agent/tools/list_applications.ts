import { defineTool } from "eve/tools";
import { z } from "zod";
import { listOwnedApplications } from "../../lib/db/applications";

export default defineTool({
  description:
    "List the authenticated candidate's application queue, approval state, manual tasks, and recent timeline. Use this before discussing an application's state.",
  inputSchema: z.object({
    limit: z.number().int().min(1).max(50).default(20),
  }),
  async execute({ limit }, ctx) {
    const identity = runtimeIdentity(ctx.session.auth.current);
    const rows = await listOwnedApplications({ ...identity, limit });
    return rows.map((application) => ({
      id: application.id,
      title: application.title,
      company: application.company,
      platform: application.platform,
      status: application.status,
      submissionMode: application.submissionMode,
      approvalStatus: application.approvalStatus,
      matchScore: application.matchScore,
      missingFacts: application.missingFacts ?? [],
      latestEvent: application.events.at(-1) ?? null,
    }));
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

