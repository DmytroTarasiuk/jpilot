import { getAuthenticatedTenantIdentity } from "@jobpilot/auth/request-context";
import { getCandidateProfile, upsertCandidateProfile } from "@jobpilot/db/profiles";
import { candidateProfileInputSchema } from "@jobpilot/domain/profile";

export async function GET() {
  const identity = await getAuthenticatedTenantIdentity();
  if (!identity) return Response.json({ error: "Authentication is required." }, { status: 401 });
  const profile = await getCandidateProfile(identity);
  return Response.json({ profile });
}

export async function PUT(request: Request) {
  const identity = await getAuthenticatedTenantIdentity();
  if (!identity) return Response.json({ error: "Authentication is required." }, { status: 401 });
  const body = candidateProfileInputSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return Response.json({ error: "Check the profile fields and list limits." }, { status: 400 });
  }
  const profile = await upsertCandidateProfile({ ...identity, profile: body.data });
  return Response.json({ id: profile.id, confirmedAt: profile.confirmedAt?.toISOString() ?? null });
}
