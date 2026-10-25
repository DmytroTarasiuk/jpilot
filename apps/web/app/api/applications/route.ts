import { getAuthenticatedTenantIdentity } from "@jobpilot/auth/request-context";
import { listOwnedApplications } from "@jobpilot/db/applications";

export async function GET() {
  const identity = await getAuthenticatedTenantIdentity();
  if (!identity) return Response.json({ error: "Authentication is required." }, { status: 401 });
  const applications = await listOwnedApplications({ ...identity, limit: 100 });
  return Response.json({ applications });
}

