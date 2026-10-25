import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import type { CandidateProfileInput, CvExtractedProfile } from "../domain/profile";
import { getDb, type AppDatabase } from "./client";
import { auditEvents, candidateProfiles, cvDocuments } from "./schema";

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
      deletedAt: cvDocuments.deletedAt,
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
    .where(and(eq(cvDocuments.id, id), eq(cvDocuments.status, "ready")));
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
    .where(and(eq(cvDocuments.id, input.id), eq(cvDocuments.status, "ready")));
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
    .where(and(eq(cvDocuments.id, input.id), eq(cvDocuments.status, "ready")));
}

export async function getActiveCvDocumentForMatching(
  input: { tenantId: string; ownerId: string },
  db: AppDatabase = getDb(),
) {
  const [document] = await db
    .select({ id: cvDocuments.id, parsedText: cvDocuments.parsedText })
    .from(cvDocuments)
    .where(
      and(
        eq(cvDocuments.tenantId, input.tenantId),
        eq(cvDocuments.ownerId, input.ownerId),
        eq(cvDocuments.status, "ready"),
        eq(cvDocuments.isActive, true),
        eq(cvDocuments.processingStatus, "confirmed"),
      ),
    )
    .limit(1);
  return document ?? null;
}

interface CvMutationResult {
  id: string;
  originalName: string;
}

interface TransactionFallback {
  transaction<T>(callback: (transaction: unknown) => Promise<T>): Promise<T>;
}

function buildCvActivationQueries(
  db: AppDatabase,
  input: { id: string; tenantId: string; ownerId: string },
  now: Date,
) {
  return [
    db
      .update(cvDocuments)
      .set({ isActive: false, updatedAt: now })
      .where(
        and(
          eq(cvDocuments.tenantId, input.tenantId),
          eq(cvDocuments.ownerId, input.ownerId),
          eq(cvDocuments.isActive, true),
        ),
      ),
    db
      .update(cvDocuments)
      .set({ isActive: true, updatedAt: now })
      .where(
        and(
          eq(cvDocuments.id, input.id),
          eq(cvDocuments.tenantId, input.tenantId),
          eq(cvDocuments.ownerId, input.ownerId),
          eq(cvDocuments.status, "ready"),
          eq(cvDocuments.processingStatus, "confirmed"),
        ),
      ),
  ] as const;
}

async function switchActiveCvDocument(
  db: AppDatabase,
  input: { id: string; tenantId: string; ownerId: string },
  now: Date,
) {
  if (typeof db.batch === "function") {
    await db.batch(buildCvActivationQueries(db, input, now));
    return;
  }

  const fallback = db as unknown as TransactionFallback;
  if (typeof fallback.transaction !== "function") {
    throw new Error("The database driver does not support atomic CV activation.");
  }
  await fallback.transaction(async (transaction) => {
    const transactionDb = transaction as AppDatabase;
    const queries = buildCvActivationQueries(transactionDb, input, now);
    await queries[0];
    await queries[1];
  });
}

export async function activateCvDocument(
  input: { id: string; tenantId: string; ownerId: string; requestId?: string | null },
  db: AppDatabase = getDb(),
) {
  const now = new Date();
  const [candidate] = await db
    .select({ id: cvDocuments.id, originalName: cvDocuments.originalName })
    .from(cvDocuments)
    .where(
      and(
        eq(cvDocuments.id, input.id),
        eq(cvDocuments.tenantId, input.tenantId),
        eq(cvDocuments.ownerId, input.ownerId),
        eq(cvDocuments.status, "ready"),
        eq(cvDocuments.processingStatus, "confirmed"),
      ),
    )
    .limit(1);
  if (!candidate) return null;

  await switchActiveCvDocument(db, input, now);
  const [activated] = await db
    .select({ id: cvDocuments.id, originalName: cvDocuments.originalName })
    .from(cvDocuments)
    .where(
      and(
        eq(cvDocuments.id, input.id),
        eq(cvDocuments.tenantId, input.tenantId),
        eq(cvDocuments.ownerId, input.ownerId),
        eq(cvDocuments.status, "ready"),
        eq(cvDocuments.processingStatus, "confirmed"),
        eq(cvDocuments.isActive, true),
      ),
    )
    .limit(1);
  if (!activated) return null;

  await db.insert(auditEvents).values({
    tenantId: input.tenantId,
    actorType: "user",
    actorId: input.ownerId,
    action: "cv.activated",
    resourceType: "cv_document",
    resourceId: input.id,
    requestId: input.requestId ?? null,
  });
  return activated satisfies CvMutationResult;
}

export interface CvDeletionClaim {
  id: string;
  objectKey: string;
  originalName: string;
  wasActive: boolean;
}

function decodeCvDeletionClaim(row: Record<string, unknown> | undefined) {
  if (!row) return null;
  if (
    typeof row.id !== "string" ||
    typeof row.objectKey !== "string" ||
    typeof row.originalName !== "string" ||
    typeof row.wasActive !== "boolean"
  ) {
    throw new Error("Invalid CV deletion claim returned by the database.");
  }
  return {
    id: row.id,
    objectKey: row.objectKey,
    originalName: row.originalName,
    wasActive: row.wasActive,
  } satisfies CvDeletionClaim;
}

function decodeCvMutationResult(row: Record<string, unknown> | undefined) {
  if (!row) return null;
  if (typeof row.id !== "string" || typeof row.originalName !== "string") {
    throw new Error("Invalid CV mutation result returned by the database.");
  }
  return { id: row.id, originalName: row.originalName } satisfies CvMutationResult;
}

export async function beginCvDocumentDeletion(
  input: { id: string; tenantId: string; ownerId: string },
  db: AppDatabase = getDb(),
) {
  const now = new Date();
  const result = await db.execute(sql<CvDeletionClaim>`
    WITH candidate AS (
      SELECT document.id, document.object_key, document.original_name, document.is_active
      FROM cv_documents AS document
      WHERE document.id = ${input.id}
        AND document.tenant_id = ${input.tenantId}
        AND document.owner_id = ${input.ownerId}
        AND document.status <> 'deleted'
      FOR UPDATE
    )
    UPDATE cv_documents AS document
    SET status = 'deleting',
        is_active = false,
        updated_at = ${now}
    FROM candidate
    WHERE document.id = candidate.id
    RETURNING
      document.id,
      candidate.object_key AS "objectKey",
      candidate.original_name AS "originalName",
      candidate.is_active AS "wasActive"
  `);
  return decodeCvDeletionClaim(result.rows[0]);
}

export async function completeCvDocumentDeletion(
  input: {
    id: string;
    tenantId: string;
    ownerId: string;
    requestId?: string | null;
    wasActive: boolean;
  },
  db: AppDatabase = getDb(),
) {
  const now = new Date();
  const result = await db.execute(sql<CvMutationResult>`
    WITH deleted AS (
      UPDATE cv_documents AS document
      SET status = 'deleted',
          object_key = 'deleted/' || document.id::text,
          original_name = '[deleted CV]',
          is_active = false,
          sha256 = NULL,
          parsed_text = NULL,
          extracted_profile = NULL,
          processing_error_code = NULL,
          deleted_at = ${now},
          updated_at = ${now}
      WHERE document.id = ${input.id}
        AND document.tenant_id = ${input.tenantId}
        AND document.owner_id = ${input.ownerId}
        AND document.status = 'deleting'
      RETURNING document.id, document.tenant_id, document.owner_id, document.original_name
    ),
    audited AS (
      INSERT INTO audit_events (
        tenant_id,
        actor_type,
        actor_id,
        action,
        resource_type,
        resource_id,
        request_id,
        metadata
      )
      SELECT
        deleted.tenant_id,
        'user',
        deleted.owner_id::text,
        'cv.deleted',
        'cv_document',
        deleted.id::text,
        ${input.requestId ?? null},
        jsonb_build_object(
          'storageObjectDeleted',
          true,
          'wasActive',
          CAST(${input.wasActive} AS boolean)
        )
      FROM deleted
      RETURNING resource_id
    )
    SELECT deleted.id, deleted.original_name AS "originalName"
    FROM deleted
  `);
  return decodeCvMutationResult(result.rows[0]);
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
        eq(cvDocuments.status, "ready"),
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
          eq(cvDocuments.status, "ready"),
          eq(cvDocuments.processingStatus, "awaiting_confirmation"),
        ),
      ),
  ]);
  return { id: input.id, confirmedAt: now };
}
