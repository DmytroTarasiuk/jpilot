import { getAuthenticatedTenantIdentity } from "@jobpilot/auth/request-context";
import { findOwnedCvDocument, markCvDocumentReady } from "@jobpilot/db/cv-documents";
import { inspectPrivateObject } from "@jobpilot/storage/r2";

export async function POST(
  _request: Request,
  context: { params: Promise<{ documentId: string }> },
) {
  const identity = await getAuthenticatedTenantIdentity();
  if (!identity) return Response.json({ error: "Authentication is required." }, { status: 401 });
  const { documentId } = await context.params;
  const document = await findOwnedCvDocument({
    id: documentId,
    tenantId: identity.tenantId,
    ownerId: identity.userId,
  });
  if (!document) return Response.json({ error: "CV upload was not found." }, { status: 404 });
  if (document.status !== "pending_upload") {
    return Response.json({ error: "This upload cannot be finalized." }, { status: 409 });
  }

  const object = await inspectPrivateObject(document.objectKey);
  if (object.ContentLength !== document.sizeBytes || object.ContentType !== document.contentType) {
    return Response.json({ error: "The uploaded object does not match the requested file." }, { status: 422 });
  }

  const completed = await markCvDocumentReady({
    id: document.id,
    tenantId: identity.tenantId,
    ownerId: identity.userId,
  });
  if (!completed) return Response.json({ error: "The upload could not be finalized." }, { status: 409 });
  return Response.json({ documentId: completed.id, status: completed.status });
}
