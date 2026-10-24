import { getAuthenticatedTenantIdentity } from "@jobpilot/auth/request-context";
import { listOwnedCvDocuments } from "@jobpilot/db/cv-documents";

export async function GET() {
  const identity = await getAuthenticatedTenantIdentity();
  if (!identity) return Response.json({ error: "Authentication is required." }, { status: 401 });
  const documents = await listOwnedCvDocuments({ ...identity, limit: 10 });
  return Response.json({ documents });
}
