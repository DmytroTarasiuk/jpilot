import { randomUUID } from "node:crypto";
import { getAuthenticatedTenantIdentity } from "@jobpilot/auth/request-context";
import { beginOwnedDataErasure, completeOwnedDataErasure } from "@jobpilot/db/privacy";
import { z } from "zod";

const confirmationSchema = z.object({
  privacyRequestId: z.string().uuid(),
  confirmationToken: z.string().min(32).max(128),
  confirmation: z.literal("DELETE MY DATA"),
});

export async function POST() {
  const identity = await getAuthenticatedTenantIdentity();
  if (!identity) return Response.json({ error: "Authentication is required." }, { status: 401 });
  const request = await beginOwnedDataErasure({ ...identity, requestId: randomUUID() });
  if (!request) return Response.json({ error: "Unable to create the erasure request." }, { status: 409 });
  return Response.json(request, { headers: { "cache-control": "no-store" } });
}

export async function DELETE(request: Request) {
  const identity = await getAuthenticatedTenantIdentity();
  if (!identity) return Response.json({ error: "Authentication is required." }, { status: 401 });
  const body = confirmationSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return Response.json({ error: 'Enter "DELETE MY DATA" to confirm.' }, { status: 400 });
  }
  const result = await completeOwnedDataErasure({ ...identity, ...body.data });
  if (!result) {
    return Response.json({ error: "The erasure confirmation is invalid or expired." }, { status: 409 });
  }
  return Response.json(result, { headers: { "cache-control": "no-store" } });
}
