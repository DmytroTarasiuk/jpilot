import { and, desc, eq, inArray, ne } from "drizzle-orm";
import type { CandidateProfileInput, CvExtractedProfile } from "../domain/profile";
import { getDb } from "./client";
import { candidateProfiles, cvDocuments } from "./schema";

export async function createPendingCvDocument(input: {
  id: string;
  tenantId: string;
  ownerId: string;
  objectKey: string;
  originalName: string;
  contentType: string;
  sizeBytes: number;
}) {
  const [record] = await getDb().insert(cvDocuments).values(input).returning();
  if (!record) throw new Error("Unable to create the CV upload record.");
  return record;
}

export async function findOwnedCvDocument(input: {
  id: string;
  tenantId: string;
  ownerId: string;
}) {
  const [record] = await getDb()
    .select()
    .from(cvDocuments)
    .where(
      and(
        eq(cvDocuments.id, input.id),
        eq(cvDocuments.tenantId, input.tenantId),
        eq(cvDocuments.ownerId, input.ownerId),
        ne(cvDocuments.status, "deleted"),
      ),
    )
    .limit(1);
  return record ?? null;
}

export async function markCvDocumentReady(input: {
  id: string;
  tenantId: string;
  ownerId: string;
}) {
  const [record] = await getDb()
    .update(cvDocuments)
    .set({ status: "ready", isActive: false, processingStatus: "pending", updatedAt: new Date() })
    .where(
      and(
        eq(cvDocuments.id, input.id),
        eq(cvDocuments.tenantId, input.tenantId),
        eq(cvDocuments.ownerId, input.ownerId),
        eq(cvDocuments.status, "pending_upload"),
      ),
    )
    .returning();
  return record ?? null;
}

export async function recordCvWorkflowDispatch(input: { id: string; workflowRunId: string }) {
  await getDb()
    .update(cvDocuments)
    .set({ workflowRunId: input.workflowRunId, updatedAt: new Date() })
    .where(and(eq(cvDocuments.id, input.id), eq(cvDocuments.status, "ready")));
}

export async function listOwnedCvDocuments(input: {
  tenantId: string;
  ownerId: string;
  limit?: number;
}) {
  return getDb()
    .select({
      id: cvDocuments.id,
      originalName: cvDocuments.originalName,
      sizeBytes: cvDocuments.sizeBytes,
      status: cvDocuments.status,
      processingStatus: cvDocuments.processingStatus,
      scanStatus: cvDocuments.scanStatus,
      extractedProfile: cvDocuments.extractedProfile,
      processingErrorCode: cvDocuments.processingErrorCode,
      isActive: cvDocuments.isActive,
      createdAt: cvDocuments.createdAt,
      parsedAt: cvDocuments.parsedAt,
      confirmedAt: cvDocuments.confirmedAt,
    })
    .from(cvDocuments)
    .where(
      and(
        eq(cvDocuments.tenantId, input.tenantId),
        eq(cvDocuments.ownerId, input.ownerId),
        ne(cvDocuments.status, "deleted"),
      ),
    )
    .orderBy(desc(cvDocuments.createdAt))
    .limit(input.limit ?? 10);
}

export async function beginCvProcessing(id: string) {
  const [document] = await getDb()
    .update(cvDocuments)
    .set({
      processingStatus: "scanning",
      scanStatus: "pending",
      processingErrorCode: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(cvDocuments.id, id),
        eq(cvDocuments.status, "ready"),
        inArray(cvDocuments.processingStatus, ["pending", "failed"]),
      ),
    )
    .returning();
  return document ?? null;
}

export async function markCvParsing(id: string, sha256: string, scanStatus: "clean" | "skipped") {
  await getDb()
    .update(cvDocuments)
    .set({
      sha256,
      scanStatus,
      scannedAt: scanStatus === "clean" ? new Date() : null,
      processingStatus: "parsing",
      updatedAt: new Date(),
    })
    .where(eq(cvDocuments.id, id));
}

export async function completeCvProcessing(input: {
  id: string;
  sha256: string;
  scanStatus: "clean" | "skipped";
  parsedText: string;
  extractedProfile: CvExtractedProfile;
}) {
  await getDb()
    .update(cvDocuments)
    .set({
      sha256: input.sha256,
      scanStatus: input.scanStatus,
      processingStatus: "awaiting_confirmation",
      parsedText: input.parsedText,
      extractedProfile: input.extractedProfile,
      scannedAt: input.scanStatus === "clean" ? new Date() : null,
      parsedAt: new Date(),
      processingErrorCode: null,
      updatedAt: new Date(),
    })
    .where(eq(cvDocuments.id, input.id));
}

export async function failCvProcessing(input: {
  id: string;
  errorCode: string;
  scanStatus: "pending" | "clean" | "skipped";
}) {
  const infected = input.errorCode === "malware_detected";
  const unavailable = input.errorCode === "malware_scanner_unavailable";
  const scannerError = input.errorCode.startsWith("malware_scanner_") && !unavailable;
  const scanStatus = infected
    ? "infected"
    : unavailable
      ? "unavailable"
      : scannerError
        ? "error"
        : input.scanStatus;
  await getDb()
    .update(cvDocuments)
    .set({
      status: infected ? "quarantined" : "ready",
      processingStatus: "failed",
      scanStatus,
      processingErrorCode: input.errorCode,
      scannedAt: scanStatus === "clean" || scanStatus === "infected" || scanStatus === "error" ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(cvDocuments.id, input.id));
}

export async function confirmCvProfile(input: {
  id: string;
  tenantId: string;
  ownerId: string;
  profile: CandidateProfileInput;
}) {
  const db = getDb();
  const [document] = await db
    .select({ id: cvDocuments.id })
    .from(cvDocuments)
    .where(
      and(
        eq(cvDocuments.id, input.id),
        eq(cvDocuments.tenantId, input.tenantId),
        eq(cvDocuments.ownerId, input.ownerId),
        eq(cvDocuments.processingStatus, "awaiting_confirmation"),
      ),
    )
    .limit(1);
  if (!document) return null;

  const now = new Date();
  await db.batch([
    db
      .insert(candidateProfiles)
      .values({ tenantId: input.tenantId, ownerId: input.ownerId, ...input.profile, confirmedAt: now })
      .onConflictDoUpdate({
        target: [candidateProfiles.tenantId, candidateProfiles.ownerId],
        set: { ...input.profile, confirmedAt: now, updatedAt: now },
      }),
    db
      .update(cvDocuments)
      .set({ isActive: false, updatedAt: now })
      .where(and(eq(cvDocuments.tenantId, input.tenantId), eq(cvDocuments.ownerId, input.ownerId))),
    db
      .update(cvDocuments)
      .set({ isActive: true, processingStatus: "confirmed", confirmedAt: now, updatedAt: now })
      .where(
        and(
          eq(cvDocuments.id, input.id),
          eq(cvDocuments.tenantId, input.tenantId),
          eq(cvDocuments.ownerId, input.ownerId),
          eq(cvDocuments.processingStatus, "awaiting_confirmation"),
        ),
      ),
  ]);
  return { id: input.id, confirmedAt: now };
}
