import { isAuthorizedSupportRequest } from "@jobpilot/auth/support";
import { getSupportDiagnostics } from "@jobpilot/db/support";

export async function GET(request: Request) {
  if (!isAuthorizedSupportRequest(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const tenantId = request.headers.get("x-jobpilot-tenant-id")?.trim() ?? "";
  const supportPrincipal = request.headers.get("x-jobpilot-support-principal")?.trim() ?? "";
  if (!tenantId || !supportPrincipal) {
    return Response.json({ error: "Tenant and support principal headers are required." }, { status: 400 });
  }
  const diagnostics = await getSupportDiagnostics({
    tenantId,
    supportPrincipal,
    requestId: request.headers.get("x-request-id"),
  });
  if (!diagnostics) return Response.json({ error: "No active diagnostics grant." }, { status: 403 });
  return Response.json(diagnostics, { headers: { "cache-control": "no-store" } });
}
