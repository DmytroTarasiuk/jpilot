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
}).superRefine((value, context) => {
  const lowerName = value.fileName.toLowerCase();
  const expectedExtension = value.contentType === "application/pdf" ? ".pdf" : ".docx";
  if (
    !lowerName.endsWith(expectedExtension) ||
    value.fileName.includes("\0") ||
    value.fileName.includes(":") ||
    value.fileName.includes("/") ||
    value.fileName.includes("\\")
  ) {
    context.addIssue({
      code: "custom",
      path: ["fileName"],
      message: "The filename and declared document type do not match.",
    });
  }
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
