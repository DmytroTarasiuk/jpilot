import { getAuthenticatedTenantIdentity } from "@jobpilot/auth/request-context";
import { updateApplicationDraft } from "@jobpilot/db/applications";
import { applicationDraftInputSchema } from "@jobpilot/domain/application";
import { z } from "zod";

const applicationIdSchema = z.string().uuid();

export async function PATCH(
  request: Request,
  context: { params: Promise<{ applicationId: string }> },
) {
  const identity = await getAuthenticatedTenantIdentity();
  if (!identity) return Response.json({ error: "Authentication is required." }, { status: 401 });
  const [applicationId, body] = await Promise.all([
    context.params.then((params) => applicationIdSchema.safeParse(params.applicationId)),
    request.json().catch(() => null).then((value) => applicationDraftInputSchema.safeParse(value)),
  ]);
  if (!applicationId.success || !body.success) {
    return Response.json({ error: "Check the cover letter and screening answers." }, { status: 400 });
  }
  const requestId = (request.headers.get("x-request-id") ?? crypto.randomUUID()).slice(0, 128);
  const result = await updateApplicationDraft({
    tenantId: identity.tenantId,
    ownerId: identity.ownerId,
    applicationId: applicationId.data,
    requestId,
    ...body.data,
  });
  if (!result) return Response.json({ error: "Application draft was not found." }, { status: 404 });
  return Response.json({ draft: result });
}

