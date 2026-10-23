import { getAuthenticatedTenantIdentity } from "@jobpilot/auth/request-context";
import { createPendingCvDocument } from "@jobpilot/db/cv-documents";
import { cvUploadRequestSchema, prepareCvUpload } from "@jobpilot/storage/cv-upload";

export async function POST(request: Request) {
  const identity = await getAuthenticatedTenantIdentity();
  if (!identity) return Response.json({ error: "Authentication is required." }, { status: 401 });

  const body = cvUploadRequestSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return Response.json({ error: "Choose a PDF or DOCX file no larger than 10 MB." }, { status: 400 });
  }

  const upload = await prepareCvUpload({
    tenantId: identity.tenantId,
    ownerId: identity.userId,
    ...body.data,
  });
  await createPendingCvDocument({
    id: upload.documentId,
    tenantId: identity.tenantId,
    ownerId: identity.userId,
    objectKey: upload.objectKey,
    originalName: body.data.fileName,
    contentType: body.data.contentType,
    sizeBytes: body.data.sizeBytes,
  });

  return Response.json({
    documentId: upload.documentId,
    uploadUrl: upload.uploadUrl,
    expiresInSeconds: upload.expiresInSeconds,
  });
}
