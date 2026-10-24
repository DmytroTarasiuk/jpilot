import { getAuthenticatedTenantIdentity } from "@jobpilot/auth/request-context";
import { confirmCvProfile } from "@jobpilot/db/cv-documents";
import { candidateProfileInputSchema } from "@jobpilot/domain/profile";

export async function POST(
  request: Request,
  context: { params: Promise<{ documentId: string }> },
) {
  const identity = await getAuthenticatedTenantIdentity();
  if (!identity) return Response.json({ error: "Authentication is required." }, { status: 401 });
  const body = candidateProfileInputSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return Response.json({ error: "Review every extracted profile field before confirming." }, { status: 400 });
  }
  const { documentId } = await context.params;
  const confirmed = await confirmCvProfile({
    id: documentId,
    ...identity,
    profile: body.data,
  });
  if (!confirmed) {
    return Response.json({ error: "This CV is not awaiting your confirmation." }, { status: 409 });
  }
  return Response.json({ id: confirmed.id, confirmedAt: confirmed.confirmedAt.toISOString() });
}
