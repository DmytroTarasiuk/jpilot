import { and, asc, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import {
  groundingFingerprint,
  renderGroundedCoverLetter,
} from "../domain/application";
import {
  assertApplicationTransition,
  nextApplicationStatuses,
} from "../domain/application-state";
import { getDb, type AppDatabase } from "./client";
import {
  applicationDrafts,
  applicationEvents,
  applications,
  approvalRequests,
  auditEvents,
  candidateProfiles,
  cvDocuments,
  jobPostings,
  jobProposals,
  type ApplicationSourceFact,
  type ApplicationStatus,
  type ScreeningAnswerDraft,
} from "./schema";

interface Identity {
  tenantId: string;
  ownerId: string;
}

export async function materializeApprovalApplication(
  input: Identity & { proposalId: string; jobPostingId: string; platform: "djinni" },
  db: AppDatabase = getDb(),
) {
  const idempotencyKey = `application:${input.tenantId}:${input.ownerId}:${input.jobPostingId}`;
  await db
    .insert(applications)
    .values({
      tenantId: input.tenantId,
      ownerId: input.ownerId,
      proposalId: input.proposalId,
      jobPostingId: input.jobPostingId,
      platform: input.platform,
      status: "approval_required",
      submissionMode: "manual",
      idempotencyKey,
    })
    .onConflictDoNothing({ target: applications.idempotencyKey });

  const [application] = await db
    .select({ id: applications.id })
    .from(applications)
    .where(
      and(
        eq(applications.tenantId, input.tenantId),
        eq(applications.ownerId, input.ownerId),
        eq(applications.jobPostingId, input.jobPostingId),
      ),
    )
    .limit(1);
  if (!application) throw new Error("application_not_found_after_materialization");

  await db
    .update(jobProposals)
    .set({ status: "approval_required", updatedAt: new Date() })
    .where(
      and(
        eq(jobProposals.id, input.proposalId),
        eq(jobProposals.tenantId, input.tenantId),
        eq(jobProposals.ownerId, input.ownerId),
        eq(jobProposals.status, "proposed"),
      ),
    );
  await db
    .insert(approvalRequests)
    .values({
      tenantId: input.tenantId,
      applicationId: application.id,
      requestedBy: "system:job-discovery",
    })
    .onConflictDoNothing();
  await db
    .insert(applicationEvents)
    .values([
      {
        tenantId: input.tenantId,
        applicationId: application.id,
        fromStatus: null,
        toStatus: "proposed",
        actorType: "system",
        actorId: "job-discovery",
        idempotencyKey: `${idempotencyKey}:event:proposed`,
        reason: "A matching vacancy was proposed.",
      },
      {
        tenantId: input.tenantId,
        applicationId: application.id,
        fromStatus: "proposed",
        toStatus: "approval_required",
        actorType: "system",
        actorId: "approval-policy",
        idempotencyKey: `${idempotencyKey}:event:approval-required`,
        reason: "Per-job approval is required before any application action.",
      },
    ])
    .onConflictDoNothing({ target: applicationEvents.idempotencyKey });
  await ensureGroundedDraft({ ...input, applicationId: application.id }, db);
  return application;
}

async function ensureGroundedDraft(
  input: Identity & { applicationId: string; jobPostingId: string },
  db: AppDatabase,
) {
  const [[profile], [activeCv], [job]] = await Promise.all([
    db
      .select()
      .from(candidateProfiles)
      .where(
        and(
          eq(candidateProfiles.tenantId, input.tenantId),
          eq(candidateProfiles.ownerId, input.ownerId),
          isNotNull(candidateProfiles.confirmedAt),
        ),
      )
      .limit(1),
    db
      .select({ id: cvDocuments.id, originalName: cvDocuments.originalName })
      .from(cvDocuments)
      .where(
        and(
          eq(cvDocuments.tenantId, input.tenantId),
          eq(cvDocuments.ownerId, input.ownerId),
          eq(cvDocuments.status, "ready"),
          eq(cvDocuments.processingStatus, "confirmed"),
          eq(cvDocuments.isActive, true),
        ),
      )
      .limit(1),
    db
      .select({ title: jobPostings.title, company: jobPostings.company })
      .from(jobPostings)
      .where(eq(jobPostings.id, input.jobPostingId))
      .limit(1),
  ]);
  if (!job) throw new Error("job_posting_not_found_for_draft");

  const facts: ApplicationSourceFact[] = [];
  if (profile?.headline) {
    facts.push({
      id: "profile:headline",
      label: "Professional headline",
      value: profile.headline,
      source: "confirmed_profile",
    });
  }
  if (profile?.targetTitles.length) {
    facts.push({
      id: "profile:target_titles",
      label: "Target roles",
      value: profile.targetTitles.join(", "),
      source: "confirmed_profile",
    });
  }
  if (profile?.languages.length) {
    facts.push({
      id: "profile:languages",
      label: "Languages",
      value: profile.languages.join(", "),
      source: "confirmed_profile",
    });
  }
  if (profile?.workModes.length) {
    facts.push({
      id: "profile:work_modes",
      label: "Work-mode preferences",
      value: profile.workModes.join(", "),
      source: "confirmed_profile",
    });
  }
  if (activeCv) {
    facts.push({
      id: `cv:${activeCv.id}`,
      label: "Active confirmed CV",
      value: activeCv.originalName,
      source: "confirmed_cv",
    });
  }
  const screeningAnswers: ScreeningAnswerDraft[] = [];
  const missingFacts = [
    "Screening questions are not included in the discovery feed and must be added for review.",
  ];
  if (!activeCv) missingFacts.push("No active confirmed CV was available when this draft was created.");
  const fingerprint = groundingFingerprint({
    sourceCvDocumentId: activeCv?.id ?? null,
    facts,
    screeningAnswers,
  });

  await db
    .insert(applicationDrafts)
    .values({
      tenantId: input.tenantId,
      ownerId: input.ownerId,
      applicationId: input.applicationId,
      sourceCvDocumentId: activeCv?.id ?? null,
      coverLetter: renderGroundedCoverLetter({
        candidateName: profile?.displayName ?? null,
        roleTitle: job.title,
        company: job.company,
        facts,
      }),
      screeningAnswers,
      sourceFacts: facts,
      missingFacts,
      groundingFingerprint: fingerprint,
      generationMode: "deterministic",
    })
    .onConflictDoNothing({ target: applicationDrafts.applicationId });
}

export async function listOwnedApplications(
  input: Identity & { limit?: number },
  db: AppDatabase = getDb(),
) {
  const rows = await db
    .select({
      id: applications.id,
      status: applications.status,
      submissionMode: applications.submissionMode,
      platform: applications.platform,
      submittedAt: applications.submittedAt,
      createdAt: applications.createdAt,
      updatedAt: applications.updatedAt,
      externalApplicationId: applications.externalApplicationId,
      jobPostingId: jobPostings.id,
      title: jobPostings.title,
      company: jobPostings.company,
      canonicalUrl: jobPostings.canonicalUrl,
      countryCode: jobPostings.countryCode,
      remote: jobPostings.remote,
      publishedAt: jobPostings.publishedAt,
      matchScore: jobProposals.matchScore,
      reasons: jobProposals.reasons,
      concerns: jobProposals.concerns,
      approvalId: approvalRequests.id,
      approvalStatus: approvalRequests.status,
      coverLetter: applicationDrafts.coverLetter,
      screeningAnswers: applicationDrafts.screeningAnswers,
      sourceFacts: applicationDrafts.sourceFacts,
      missingFacts: applicationDrafts.missingFacts,
      sourceCvDocumentId: applicationDrafts.sourceCvDocumentId,
      draftRevision: applicationDrafts.revision,
      generationMode: applicationDrafts.generationMode,
    })
    .from(applications)
    .innerJoin(jobPostings, eq(applications.jobPostingId, jobPostings.id))
    .innerJoin(jobProposals, eq(applications.proposalId, jobProposals.id))
    .leftJoin(
      approvalRequests,
      and(
        eq(approvalRequests.applicationId, applications.id),
        eq(approvalRequests.status, "pending"),
      ),
    )
    .leftJoin(applicationDrafts, eq(applicationDrafts.applicationId, applications.id))
    .where(
      and(
        eq(applications.tenantId, input.tenantId),
        eq(applications.ownerId, input.ownerId),
      ),
    )
    .orderBy(desc(applications.updatedAt))
    .limit(input.limit ?? 100);

  const ids = rows.map((row) => row.id);
  const events = ids.length
    ? await db
        .select({
          id: applicationEvents.id,
          applicationId: applicationEvents.applicationId,
          fromStatus: applicationEvents.fromStatus,
          toStatus: applicationEvents.toStatus,
          actorType: applicationEvents.actorType,
          reason: applicationEvents.reason,
          metadata: applicationEvents.metadata,
          createdAt: applicationEvents.createdAt,
        })
        .from(applicationEvents)
        .where(
          and(
            eq(applicationEvents.tenantId, input.tenantId),
            inArray(applicationEvents.applicationId, ids),
          ),
        )
        .orderBy(asc(applicationEvents.createdAt))
    : [];
  const byApplication = new Map<string, typeof events>();
  for (const event of events) {
    const current = byApplication.get(event.applicationId) ?? [];
    current.push(event);
    byApplication.set(event.applicationId, current);
  }
  return rows.map((row) => ({ ...row, events: byApplication.get(row.id) ?? [] }));
}

interface DecisionResult {
  applicationId: string;
  finalStatus: ApplicationStatus;
  submissionMode: string;
}

export async function decideApplication(
  input: Identity & {
    applicationId: string;
    decision: "approve" | "reject";
    reason?: string;
    requestId: string;
    actorType?: "user" | "agent";
  },
  db: AppDatabase = getDb(),
) {
  const [target] = await db
    .select({ submissionMode: applications.submissionMode })
    .from(applications)
    .innerJoin(
      approvalRequests,
      and(
        eq(approvalRequests.applicationId, applications.id),
        eq(approvalRequests.status, "pending"),
      ),
    )
    .where(
      and(
        eq(applications.id, input.applicationId),
        eq(applications.tenantId, input.tenantId),
        eq(applications.ownerId, input.ownerId),
        eq(applications.status, "approval_required"),
      ),
    )
    .limit(1);
  if (!target) return null;

  const now = new Date();
  const manualEventAt = new Date(now.getTime() + 1);
  const actorType = input.actorType ?? "user";
  const reason = input.reason?.trim() || (input.decision === "approve" ? "Approved by user." : "Rejected by user.");
  const approvalStatus = input.decision === "approve" ? "approved" : "rejected";
  const finalStatus: ApplicationStatus =
    input.decision === "reject"
      ? "dismissed"
      : target.submissionMode === "direct"
        ? "approved"
        : "manual_required";
  const result = await db.execute(sql<DecisionResult>`
    WITH decided AS (
      UPDATE approval_requests AS approval
      SET status = ${approvalStatus}::approval_status,
          decided_by = ${input.ownerId},
          decision_reason = ${reason},
          decided_at = ${now},
          updated_at = ${now}
      FROM applications AS application
      WHERE approval.application_id = application.id
        AND approval.status = 'pending'
        AND application.id = ${input.applicationId}
        AND application.tenant_id = ${input.tenantId}
        AND application.owner_id = ${input.ownerId}
        AND application.status = 'approval_required'
      RETURNING application.id, application.proposal_id, application.submission_mode
    ), changed AS (
      UPDATE applications AS application
      SET status = ${finalStatus}::application_status,
          updated_at = ${now}
      FROM decided
      WHERE application.id = decided.id
        AND application.status = 'approval_required'
      RETURNING application.id, application.proposal_id, application.submission_mode
    ), proposal_changed AS (
      UPDATE job_proposals AS proposal
      SET status = ${finalStatus === "dismissed" ? "dismissed" : finalStatus === "approved" ? "approved" : "manual_required"}::proposal_status,
          updated_at = ${now}
      FROM changed
      WHERE proposal.id = changed.proposal_id
      RETURNING proposal.id
    ), first_event AS (
      INSERT INTO application_events (
        tenant_id, application_id, from_status, to_status, actor_type, actor_id,
        idempotency_key, reason, metadata, created_at
      )
      SELECT
        ${input.tenantId}, changed.id, 'approval_required'::application_status,
        ${input.decision === "approve" ? "approved" : "dismissed"}::application_status,
        ${actorType}::actor_type, ${input.ownerId},
        ${`${input.requestId}:decision`}, ${reason}, '{}'::jsonb, ${now}
      FROM changed
      ON CONFLICT (idempotency_key) DO NOTHING
      RETURNING application_id
    ), manual_event AS (
      INSERT INTO application_events (
        tenant_id, application_id, from_status, to_status, actor_type, actor_id,
        idempotency_key, reason, metadata, created_at
      )
      SELECT
        ${input.tenantId}, changed.id, 'approved'::application_status,
        'manual_required'::application_status, 'system'::actor_type, 'capability-policy',
        ${`${input.requestId}:manual`},
        'This platform does not expose a permitted direct-submit path.',
        '{"submissionMode":"manual"}'::jsonb, ${manualEventAt}
      FROM changed
      WHERE changed.submission_mode = 'manual' AND ${input.decision} = 'approve'
      ON CONFLICT (idempotency_key) DO NOTHING
      RETURNING application_id
    ), audited AS (
      INSERT INTO audit_events (
        tenant_id, actor_type, actor_id, action, resource_type, resource_id,
        request_id, metadata, created_at
      )
      SELECT
        ${input.tenantId}, ${actorType}::actor_type, ${input.ownerId},
        ${input.decision === "approve" ? "application.approved" : "application.rejected"},
        'application', changed.id::text, ${input.requestId},
        jsonb_build_object('finalStatus', ${finalStatus}::text, 'submissionMode', changed.submission_mode),
        ${now}
      FROM changed
      RETURNING resource_id
    )
    SELECT changed.id AS "applicationId",
           ${finalStatus}::application_status AS "finalStatus",
           changed.submission_mode AS "submissionMode"
    FROM changed
  `);
  return (result.rows[0] as unknown as DecisionResult | undefined) ?? null;
}

export async function updateApplicationDraft(
  input: Identity & {
    applicationId: string;
    coverLetter: string;
    screeningAnswers: ScreeningAnswerDraft[];
    requestId: string;
  },
  db: AppDatabase = getDb(),
) {
  const [owned] = await db
    .select({ id: applicationDrafts.id, status: applications.status })
    .from(applicationDrafts)
    .innerJoin(applications, eq(applicationDrafts.applicationId, applications.id))
    .where(
      and(
        eq(applicationDrafts.applicationId, input.applicationId),
        eq(applicationDrafts.tenantId, input.tenantId),
        eq(applicationDrafts.ownerId, input.ownerId),
        eq(applications.tenantId, input.tenantId),
        eq(applications.ownerId, input.ownerId),
        inArray(applications.status, ["approval_required", "manual_required"]),
      ),
    )
    .limit(1);
  if (!owned) return null;
  const now = new Date();
  const [draft] = await db
    .update(applicationDrafts)
    .set({
      coverLetter: input.coverLetter,
      screeningAnswers: input.screeningAnswers,
      generationMode: "user_edited",
      revision: sql`${applicationDrafts.revision} + 1`,
      lastEditedBy: input.ownerId,
      updatedAt: now,
    })
    .where(
      and(
        eq(applicationDrafts.id, owned.id),
        sql`EXISTS (
          SELECT 1 FROM applications AS editable_application
          WHERE editable_application.id = ${input.applicationId}
            AND editable_application.tenant_id = ${input.tenantId}
            AND editable_application.owner_id = ${input.ownerId}
            AND editable_application.status IN ('approval_required', 'manual_required')
        )`,
      ),
    )
    .returning({ id: applicationDrafts.id, revision: applicationDrafts.revision });
  if (!draft) return null;
  await db.insert(auditEvents).values({
    tenantId: input.tenantId,
    actorType: "user",
    actorId: input.ownerId,
    action: "application.draft_updated",
    resourceType: "application",
    resourceId: input.applicationId,
    requestId: input.requestId,
    metadata: { revision: draft.revision, screeningAnswerCount: input.screeningAnswers.length },
  });
  return draft;
}

interface StatusCorrectionRow {
  applicationId: string;
  status: ApplicationStatus;
}

export async function correctApplicationStatus(
  input: Identity & {
    applicationId: string;
    status: ApplicationStatus;
    reason?: string;
    requestId: string;
  },
  db: AppDatabase = getDb(),
) {
  const [current] = await db
    .select({ status: applications.status })
    .from(applications)
    .where(
      and(
        eq(applications.id, input.applicationId),
        eq(applications.tenantId, input.tenantId),
        eq(applications.ownerId, input.ownerId),
      ),
    )
    .limit(1);
  if (!current) return null;
  assertApplicationTransition(current.status, input.status);

  const now = new Date();
  const reason = input.reason?.trim() || "Status confirmed by user.";
  const result = await db.execute(sql<StatusCorrectionRow>`
    WITH changed AS (
      UPDATE applications AS application
      SET status = ${input.status}::application_status,
          submitted_at = CASE
            WHEN ${input.status} = 'submitted' AND application.submitted_at IS NULL THEN ${now}
            ELSE application.submitted_at
          END,
          updated_at = ${now}
      WHERE application.id = ${input.applicationId}
        AND application.tenant_id = ${input.tenantId}
        AND application.owner_id = ${input.ownerId}
        AND application.status = ${current.status}::application_status
      RETURNING application.id
    ), recorded AS (
      INSERT INTO application_events (
        tenant_id, application_id, from_status, to_status, actor_type, actor_id,
        idempotency_key, reason, metadata, created_at
      )
      SELECT
        ${input.tenantId}, changed.id, ${current.status}::application_status,
        ${input.status}::application_status, 'user'::actor_type, ${input.ownerId},
        ${input.requestId}, ${reason},
        jsonb_build_object('source', 'user_correction'), ${now}
      FROM changed
      ON CONFLICT (idempotency_key) DO NOTHING
      RETURNING application_id
    ), audited AS (
      INSERT INTO audit_events (
        tenant_id, actor_type, actor_id, action, resource_type, resource_id,
        request_id, metadata, created_at
      )
      SELECT
        ${input.tenantId}, 'user'::actor_type, ${input.ownerId},
        'application.status_corrected', 'application', changed.id::text,
        ${input.requestId}, jsonb_build_object('from', ${current.status}::text, 'to', ${input.status}::text), ${now}
      FROM changed
      RETURNING resource_id
    )
    SELECT changed.id AS "applicationId", ${input.status}::application_status AS status
    FROM changed
  `);
  return (result.rows[0] as unknown as StatusCorrectionRow | undefined) ?? null;
}

export async function getOwnedApplicationForSubmission(
  input: Identity & { applicationId: string },
  db: AppDatabase = getDb(),
) {
  const [row] = await db
    .select({
      id: applications.id,
      tenantId: applications.tenantId,
      ownerId: applications.ownerId,
      status: applications.status,
      platform: applications.platform,
      submissionMode: applications.submissionMode,
      idempotencyKey: applications.idempotencyKey,
      externalApplicationId: applications.externalApplicationId,
      title: jobPostings.title,
      company: jobPostings.company,
      canonicalUrl: jobPostings.canonicalUrl,
      sourceCvDocumentId: applicationDrafts.sourceCvDocumentId,
      coverLetter: applicationDrafts.coverLetter,
      screeningAnswers: applicationDrafts.screeningAnswers,
      groundingFingerprint: applicationDrafts.groundingFingerprint,
      approvalStatus: approvalRequests.status,
    })
    .from(applications)
    .innerJoin(jobPostings, eq(applications.jobPostingId, jobPostings.id))
    .innerJoin(applicationDrafts, eq(applicationDrafts.applicationId, applications.id))
    .leftJoin(
      approvalRequests,
      and(
        eq(approvalRequests.applicationId, applications.id),
        eq(approvalRequests.status, "approved"),
      ),
    )
    .where(
      and(
        eq(applications.id, input.applicationId),
        eq(applications.tenantId, input.tenantId),
        eq(applications.ownerId, input.ownerId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export function permittedUserStatusTargets(status: ApplicationStatus) {
  const userStatuses = new Set<ApplicationStatus>([
    "submitted",
    "acknowledged",
    "interview",
    "rejected",
    "offer",
    "withdrawn",
    "outcome_unknown",
    "dismissed",
  ]);
  return nextApplicationStatuses(status).filter((candidate) => userStatuses.has(candidate));
}

