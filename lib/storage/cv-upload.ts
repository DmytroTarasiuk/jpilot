import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createPrivateUploadUrl } from "./r2";

export const MAX_CV_BYTES = 10 * 1024 * 1024;
export const allowedCvTypes = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;

export const cvUploadRequestSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  contentType: z.enum(allowedCvTypes),
  sizeBytes: z.number().int().positive().max(MAX_CV_BYTES),
});

export async function prepareCvUpload(input: {
  tenantId: string;
  ownerId: string;
  fileName: string;
  contentType: (typeof allowedCvTypes)[number];
  sizeBytes: number;
}) {
  const documentId = randomUUID();
  const extension = input.contentType === "application/pdf" ? "pdf" : "docx";
  const objectKey = `tenants/${input.tenantId}/users/${input.ownerId}/cv/${documentId}.${extension}`;
  const uploadUrl = await createPrivateUploadUrl({
    objectKey,
    contentType: input.contentType,
    sizeBytes: input.sizeBytes,
  });

  return {
    documentId,
    objectKey,
    uploadUrl,
    expiresInSeconds: 10 * 60,
  };
}
