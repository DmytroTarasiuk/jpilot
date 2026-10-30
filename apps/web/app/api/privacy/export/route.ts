import { randomUUID } from "node:crypto";
import { getAuthenticatedTenantIdentity } from "@jobpilot/auth/request-context";
import { buildOwnedDataExport } from "@jobpilot/db/privacy";

export async function GET() {
  const identity = await getAuthenticatedTenantIdentity();
  if (!identity) return Response.json({ error: "Authentication is required." }, { status: 401 });
  const data = await buildOwnedDataExport({ ...identity, requestId: randomUUID() });
  const date = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "cache-control": "no-store, max-age=0",
      "content-disposition": `attachment; filename="jobpilot-export-${date}.json"`,
      "content-type": "application/json; charset=utf-8",
      "x-content-type-options": "nosniff",
    },
  });
}
