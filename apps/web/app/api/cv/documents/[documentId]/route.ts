import { getAuthenticatedTenantIdentity } from "@jobpilot/auth/request-context";
import { deleteOwnedCvDocument } from "@jobpilot/cv/management";
import { activateCvDocument } from "@jobpilot/db/cv-documents";
import { z } from "zod";

const documentIdSchema = z.string().uuid();

function requestId(request: Request) {
  return (request.headers.get("x-request-id") ?? crypto.randomUUID()).slice(0, 128);
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ documentId: string }> },
) {
  const identity = await getAuthenticatedTenantIdentity();
  if (!identity) return Response.json({ error: "Authentication is required." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { isActive?: unknown } | null;
  if (body?.isActive !== true) {
    return Response.json({ error: "Only activation is supported." }, { status: 400 });
  }

  const documentIdResult = documentIdSchema.safeParse((await context.params).documentId);
  if (!documentIdResult.success) {
    return Response.json({ error: "The CV identifier is invalid." }, { status: 400 });
  }
  const documentId = documentIdResult.data;
  const activated = await activateCvDocument({
    id: documentId,
    tenantId: identity.tenantId,
    ownerId: identity.userId,
    requestId: requestId(request),
  });
  if (!activated) {
    return Response.json({ error: "A confirmed CV was not found." }, { status: 404 });
  }
  return Response.json({ document: activated });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ documentId: string }> },
) {
  const identity = await getAuthenticatedTenantIdentity();
  if (!identity) return Response.json({ error: "Authentication is required." }, { status: 401 });
  const documentIdResult = documentIdSchema.safeParse((await context.params).documentId);
  if (!documentIdResult.success) {
    return Response.json({ error: "The CV identifier is invalid." }, { status: 400 });
  }
  const documentId = documentIdResult.data;

  try {
    const deleted = await deleteOwnedCvDocument({
      id: documentId,
      tenantId: identity.tenantId,
      ownerId: identity.userId,
      requestId: requestId(request),
    });
    if (!deleted) return Response.json({ error: "CV was not found." }, { status: 404 });
    return Response.json({ deleted: true, documentId: deleted.id });
  } catch (error) {
    console.error("CV deletion did not complete", {
      documentId,
      code: error instanceof Error ? error.message : "cv_deletion_failed",
    });
    return Response.json(
      { error: "The CV is no longer active, but private-file cleanup is still pending. Retry deletion." },
      { status: 503 },
    );
  }
}
