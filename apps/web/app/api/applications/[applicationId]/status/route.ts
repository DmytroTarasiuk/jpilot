import { getAuthenticatedTenantIdentity } from "@jobpilot/auth/request-context";
import { correctApplicationStatus } from "@jobpilot/db/applications";
import { applicationStatusCorrectionInputSchema } from "@jobpilot/domain/application";
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
    request
      .json()
      .catch(() => null)
      .then((value) => applicationStatusCorrectionInputSchema.safeParse(value)),
  ]);
  if (!applicationId.success || !body.success) {
    return Response.json({ error: "The status update is invalid." }, { status: 400 });
  }
  try {
    const result = await correctApplicationStatus({
      tenantId: identity.tenantId,
      ownerId: identity.ownerId,
      applicationId: applicationId.data,
      ...body.data,
    });
    if (!result) return Response.json({ error: "Application was not found." }, { status: 404 });
    return Response.json(result);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Invalid application transition:")) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}

