import { and, eq, sql } from "drizzle-orm";
import { sha256 } from "../domain/job";
import { getOwnedApplicationForSubmission } from "../db/applications";
import { getDb, type AppDatabase } from "../db/client";
import {
  applicationSubmissionAttempts,
} from "../db/schema";
import type {
  DirectSubmissionAdapter,
  DirectSubmissionReceipt,
} from "./adapters/types";
import { SubmissionOutcomeUnknownError } from "./adapters/types";

interface SubmissionResult {
  status: "submitted" | "failed" | "outcome_unknown";
  receipt: DirectSubmissionReceipt | null;
}

export async function submitApprovedApplication(input: {
  tenantId: string;
  ownerId: string;
  applicationId: string;
  adapter: DirectSubmissionAdapter;
  db?: AppDatabase;
}): Promise<SubmissionResult> {
  const db = input.db ?? getDb();
  const application = await getOwnedApplicationForSubmission(input, db);
  if (!application) throw new Error("application_not_found");
  if (application.submissionMode !== "direct") throw new Error("direct_submission_not_enabled");
  if (application.approvalStatus !== "approved") throw new Error("application_not_approved");
  if (application.platform !== input.adapter.platform) throw new Error("submission_adapter_platform_mismatch");
  if (!input.adapter.supportsProviderIdempotency) throw new Error("provider_idempotency_required");
  if (application.screeningAnswers.some((answer) => answer.needsReview || answer.answer === null)) {
    throw new Error("screening_answers_require_review");
  }

  const idempotencyKey = `${application.idempotencyKey}:submit:v1`;
  const requestHash = sha256(
    JSON.stringify({
      applicationId: application.id,
      platform: application.platform,
      coverLetter: application.coverLetter,
      screeningAnswers: application.screeningAnswers,
      sourceCvDocumentId: application.sourceCvDocumentId,
      groundingFingerprint: application.groundingFingerprint,
    }),
  );
  await db
    .insert(applicationSubmissionAttempts)
    .values({
      tenantId: input.tenantId,
      ownerId: input.ownerId,
      applicationId: application.id,
      platform: application.platform,
      idempotencyKey,
      requestHash,
    })
    .onConflictDoNothing({ target: applicationSubmissionAttempts.idempotencyKey });
  const [attempt] = await db
    .select()
    .from(applicationSubmissionAttempts)
    .where(
      and(
        eq(applicationSubmissionAttempts.idempotencyKey, idempotencyKey),
        eq(applicationSubmissionAttempts.tenantId, input.tenantId),
        eq(applicationSubmissionAttempts.ownerId, input.ownerId),
      ),
    )
    .limit(1);
  if (!attempt) throw new Error("submission_attempt_not_found");
  if (attempt.requestHash !== requestHash) throw new Error("submission_payload_changed_after_approval");
  if (attempt.status === "submitted" && attempt.externalApplicationId && attempt.safeReceipt) {
    return {
      status: "submitted",
      receipt: {
        externalApplicationId: attempt.externalApplicationId,
        submittedAt: (attempt.completedAt ?? attempt.updatedAt).toISOString(),
        safeReceipt: attempt.safeReceipt,
      },
    };
  }
  if (attempt.status === "outcome_unknown") return { status: "outcome_unknown", receipt: null };
  if (!isSubmittableStatus(application.status)) {
    throw new Error(`application_not_submittable:${application.status}`);
  }

  await transitionToApplying(db, {
    ...input,
    fromStatus: application.status,
    idempotencyKey: `${idempotencyKey}:applying:${application.status}`,
  });
  try {
    const receipt = await input.adapter.submit({
      applicationId: application.id,
      idempotencyKey,
      roleTitle: application.title,
      company: application.company,
      applicationUrl: application.canonicalUrl,
      cvDocumentId: application.sourceCvDocumentId,
      coverLetter: application.coverLetter,
      screeningAnswers: application.screeningAnswers,
    });
    await recordSubmission(db, {
      ...input,
      idempotencyKey,
      receipt,
    });
    return { status: "submitted", receipt };
  } catch (error) {
    const outcomeUnknown = error instanceof SubmissionOutcomeUnknownError;
    await recordSubmissionFailure(db, {
      ...input,
      idempotencyKey,
      outcomeUnknown,
      failureCode: error instanceof Error ? error.message.slice(0, 128) : "submission_failed",
    });
    if (outcomeUnknown) return { status: "outcome_unknown", receipt: null };
    throw error;
  }
}

function isSubmittableStatus(status: string): status is "approved" | "applying" | "failed" {
  return status === "approved" || status === "applying" || status === "failed";
}

async function transitionToApplying(
  db: AppDatabase,
  input: {
    tenantId: string;
    ownerId: string;
    applicationId: string;
    fromStatus: "approved" | "applying" | "failed";
    idempotencyKey: string;
  },
) {
  if (input.fromStatus === "applying") return;
  const now = new Date();
  await db.execute(sql`
    WITH changed AS (
      UPDATE applications AS application
      SET status = 'applying'::application_status, updated_at = ${now}
      WHERE application.id = ${input.applicationId}
        AND application.tenant_id = ${input.tenantId}
        AND application.owner_id = ${input.ownerId}
        AND application.status = ${input.fromStatus}::application_status
      RETURNING application.id
    )
    INSERT INTO application_events (
      tenant_id, application_id, from_status, to_status, actor_type, actor_id,
      idempotency_key, reason, metadata, created_at
    )
    SELECT ${input.tenantId}, changed.id, ${input.fromStatus}::application_status,
           'applying'::application_status, 'system'::actor_type, 'submission-workflow',
           ${input.idempotencyKey}, 'Approved direct submission started.', '{}'::jsonb, ${now}
    FROM changed
    ON CONFLICT (idempotency_key) DO NOTHING
  `);
}

async function recordSubmission(
  db: AppDatabase,
  input: {
    tenantId: string;
    ownerId: string;
    applicationId: string;
    idempotencyKey: string;
    receipt: DirectSubmissionReceipt;
  },
) {
  const completedAt = new Date(input.receipt.submittedAt);
  if (Number.isNaN(completedAt.getTime())) throw new Error("submission_receipt_date_invalid");
  await db.execute(sql`
    WITH attempt AS (
      UPDATE application_submission_attempts
      SET status = 'submitted'::submission_attempt_status,
          external_application_id = ${input.receipt.externalApplicationId},
          safe_receipt = ${JSON.stringify(input.receipt.safeReceipt)}::jsonb,
          completed_at = ${completedAt}, updated_at = ${completedAt}
      WHERE idempotency_key = ${input.idempotencyKey}
        AND tenant_id = ${input.tenantId}
        AND owner_id = ${input.ownerId}
      RETURNING application_id
    ), changed AS (
      UPDATE applications AS application
      SET status = 'submitted'::application_status,
          external_application_id = ${input.receipt.externalApplicationId},
          submitted_at = ${completedAt}, updated_at = ${completedAt}
      FROM attempt
      WHERE application.id = attempt.application_id
        AND application.id = ${input.applicationId}
        AND application.status = 'applying'
      RETURNING application.id
    )
    INSERT INTO application_events (
      tenant_id, application_id, from_status, to_status, actor_type, actor_id,
      idempotency_key, reason, metadata, created_at
    )
    SELECT ${input.tenantId}, changed.id, 'applying'::application_status,
           'submitted'::application_status, 'connector'::actor_type, 'direct-submit-adapter',
           ${`${input.idempotencyKey}:submitted`}, 'The provider returned a durable submission receipt.',
           jsonb_build_object('externalApplicationId', ${input.receipt.externalApplicationId}::text),
           ${completedAt}
    FROM changed
    ON CONFLICT (idempotency_key) DO NOTHING
  `);
}

async function recordSubmissionFailure(
  db: AppDatabase,
  input: {
    tenantId: string;
    ownerId: string;
    applicationId: string;
    idempotencyKey: string;
    outcomeUnknown: boolean;
    failureCode: string;
  },
) {
  const now = new Date();
  const status = input.outcomeUnknown ? "outcome_unknown" : "failed";
  await db.execute(sql`
    WITH attempt AS (
      UPDATE application_submission_attempts
      SET status = ${status}::submission_attempt_status,
          failure_code = ${input.failureCode}, completed_at = ${now}, updated_at = ${now}
      WHERE idempotency_key = ${input.idempotencyKey}
        AND tenant_id = ${input.tenantId}
        AND owner_id = ${input.ownerId}
      RETURNING application_id
    ), changed AS (
      UPDATE applications AS application
      SET status = ${status}::application_status, updated_at = ${now}
      FROM attempt
      WHERE application.id = attempt.application_id
        AND application.id = ${input.applicationId}
        AND application.status = 'applying'
      RETURNING application.id
    )
    INSERT INTO application_events (
      tenant_id, application_id, from_status, to_status, actor_type, actor_id,
      idempotency_key, reason, metadata, created_at
    )
    SELECT ${input.tenantId}, changed.id, 'applying'::application_status,
           ${status}::application_status, 'connector'::actor_type, 'direct-submit-adapter',
           ${`${input.idempotencyKey}:${status}`}, ${input.failureCode},
           jsonb_build_object('outcomeUnknown', ${input.outcomeUnknown}), ${now}
    FROM changed
    ON CONFLICT (idempotency_key) DO NOTHING
  `);
}

