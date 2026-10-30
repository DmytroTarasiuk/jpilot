import { createHash, randomBytes } from "node:crypto";
import { and, eq, ne } from "drizzle-orm";
import { deletePrivateObject } from "../storage/r2";
import { getDb, type AppDatabase } from "./client";
import {
  agentSessions,
  applications,
  auditEvents,
  candidateProfiles,
  cvDocuments,
  jobPostings,
  jobProposals,
  notificationPreferences,
  notifications,
  platformIntegrations,
  privacyConsents,
  privacyRequests,
  searchRuns,
  searchSchedules,
  supportGrants,
  tenantMembers,
  tenants,
  users,
} from "./schema";

export const PRIVACY_POLICY_VERSION = "2026-10-30";

interface OwnedIdentity {
  tenantId: string;
  ownerId: string;
}

export async function recordPrivacyConsent(input: OwnedIdentity & {
  consentType: "job_search_processing";
  granted: boolean;
  requestId: string;
  db?: AppDatabase;
}) {
  const db = input.db ?? getDb();
  const [consent] = await db
    .insert(privacyConsents)
    .values({
      tenantId: input.tenantId,
      ownerId: input.ownerId,
      subjectHash: subjectHash(input.ownerId),
      consentType: input.consentType,
      policyVersion: PRIVACY_POLICY_VERSION,
      granted: input.granted,
      requestId: input.requestId,
    })
    .onConflictDoNothing({ target: privacyConsents.requestId })
    .returning();
  return consent ?? null;
}

export async function getPrivacyState(
  input: OwnedIdentity,
  db: AppDatabase = getDb(),
) {
  const [consents, requests] = await Promise.all([
    db
      .select()
      .from(privacyConsents)
      .where(
        and(
          eq(privacyConsents.tenantId, input.tenantId),
          eq(privacyConsents.ownerId, input.ownerId),
        ),
      )
      .orderBy(privacyConsents.createdAt),
    db
      .select({
        id: privacyRequests.id,
        type: privacyRequests.type,
        status: privacyRequests.status,
        failureCode: privacyRequests.failureCode,
        createdAt: privacyRequests.createdAt,
        completedAt: privacyRequests.completedAt,
      })
      .from(privacyRequests)
      .where(
        and(
          eq(privacyRequests.tenantId, input.tenantId),
          eq(privacyRequests.ownerId, input.ownerId),
        ),
      )
      .orderBy(privacyRequests.createdAt),
  ]);
  return { consents, requests, policyVersion: PRIVACY_POLICY_VERSION };
}

export async function buildOwnedDataExport(input: OwnedIdentity & {
  requestId: string;
  db?: AppDatabase;
}) {
  const db = input.db ?? getDb();
  const idempotencyKey = `privacy:export:${input.tenantId}:${input.ownerId}:${input.requestId}`;
  const [request] = await db
    .insert(privacyRequests)
    .values({
      tenantId: input.tenantId,
      ownerId: input.ownerId,
      subjectHash: subjectHash(input.ownerId),
      type: "export",
      status: "processing",
      idempotencyKey,
    })
    .onConflictDoUpdate({
      target: privacyRequests.idempotencyKey,
      set: { status: "processing", failureCode: null, updatedAt: new Date() },
    })
    .returning();

  const [profile, cvs, integrations, schedules, runs, proposals, ownedApplications, preferences, ownedNotifications, consents] = await Promise.all([
    db.select().from(candidateProfiles).where(and(eq(candidateProfiles.tenantId, input.tenantId), eq(candidateProfiles.ownerId, input.ownerId))),
    db
      .select({
        id: cvDocuments.id,
        originalName: cvDocuments.originalName,
        contentType: cvDocuments.contentType,
        sizeBytes: cvDocuments.sizeBytes,
        sha256: cvDocuments.sha256,
        status: cvDocuments.status,
        processingStatus: cvDocuments.processingStatus,
        scanStatus: cvDocuments.scanStatus,
        isActive: cvDocuments.isActive,
        parsedText: cvDocuments.parsedText,
        extractedProfile: cvDocuments.extractedProfile,
        createdAt: cvDocuments.createdAt,
        confirmedAt: cvDocuments.confirmedAt,
      })
      .from(cvDocuments)
      .where(and(eq(cvDocuments.tenantId, input.tenantId), eq(cvDocuments.ownerId, input.ownerId))),
    db
      .select({
        platform: platformIntegrations.platform,
        status: platformIntegrations.status,
        authMode: platformIntegrations.authMode,
        capabilities: platformIntegrations.capabilities,
        lastVerifiedAt: platformIntegrations.lastVerifiedAt,
      })
      .from(platformIntegrations)
      .where(and(eq(platformIntegrations.tenantId, input.tenantId), eq(platformIntegrations.ownerId, input.ownerId))),
    db.select({
      id: searchSchedules.id,
      name: searchSchedules.name,
      cadence: searchSchedules.cadence,
      timezone: searchSchedules.timezone,
      localTime: searchSchedules.localTime,
      dayOfWeek: searchSchedules.dayOfWeek,
      targetCountries: searchSchedules.targetCountries,
      enabled: searchSchedules.enabled,
      desiredEnabled: searchSchedules.desiredEnabled,
      maxAgeDays: searchSchedules.maxAgeDays,
      nextRunAt: searchSchedules.nextRunAt,
      lastSuccessfulWindowEnd: searchSchedules.lastSuccessfulWindowEnd,
      createdAt: searchSchedules.createdAt,
      updatedAt: searchSchedules.updatedAt,
    }).from(searchSchedules).where(and(eq(searchSchedules.tenantId, input.tenantId), eq(searchSchedules.ownerId, input.ownerId))),
    db.select({
      id: searchRuns.id,
      scheduleId: searchRuns.scheduleId,
      trigger: searchRuns.trigger,
      status: searchRuns.status,
      scheduledFor: searchRuns.scheduledFor,
      windowStart: searchRuns.windowStart,
      windowEnd: searchRuns.windowEnd,
      counters: searchRuns.counters,
      failureCode: searchRuns.failureCode,
      startedAt: searchRuns.startedAt,
      completedAt: searchRuns.completedAt,
      createdAt: searchRuns.createdAt,
    }).from(searchRuns).where(and(eq(searchRuns.tenantId, input.tenantId), eq(searchRuns.ownerId, input.ownerId))),
    db.select({
      id: jobProposals.id,
      runId: jobProposals.runId,
      status: jobProposals.status,
      matchScore: jobProposals.matchScore,
      reasons: jobProposals.reasons,
      concerns: jobProposals.concerns,
      title: jobPostings.title,
      company: jobPostings.company,
      canonicalUrl: jobPostings.canonicalUrl,
      platform: jobPostings.platform,
      createdAt: jobProposals.createdAt,
      updatedAt: jobProposals.updatedAt,
    }).from(jobProposals).innerJoin(jobPostings, eq(jobProposals.jobPostingId, jobPostings.id)).where(and(eq(jobProposals.tenantId, input.tenantId), eq(jobProposals.ownerId, input.ownerId))),
    db.select({
      id: applications.id,
      proposalId: applications.proposalId,
      platform: applications.platform,
      status: applications.status,
      submissionMode: applications.submissionMode,
      externalApplicationId: applications.externalApplicationId,
      submittedAt: applications.submittedAt,
      createdAt: applications.createdAt,
      updatedAt: applications.updatedAt,
    }).from(applications).where(and(eq(applications.tenantId, input.tenantId), eq(applications.ownerId, input.ownerId))),
    db.select().from(notificationPreferences).where(and(eq(notificationPreferences.tenantId, input.tenantId), eq(notificationPreferences.ownerId, input.ownerId))),
    db.select().from(notifications).where(and(eq(notifications.tenantId, input.tenantId), eq(notifications.ownerId, input.ownerId))),
    db.select({ consentType: privacyConsents.consentType, policyVersion: privacyConsents.policyVersion, granted: privacyConsents.granted, source: privacyConsents.source, createdAt: privacyConsents.createdAt }).from(privacyConsents).where(and(eq(privacyConsents.tenantId, input.tenantId), eq(privacyConsents.ownerId, input.ownerId))),
  ]);

  await db
    .update(privacyRequests)
    .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
    .where(eq(privacyRequests.id, request!.id));
  await db.insert(auditEvents).values({
    tenantId: input.tenantId,
    actorType: "user",
    actorId: input.ownerId,
    action: "privacy.export_completed",
    resourceType: "privacy_request",
    resourceId: request!.id,
    requestId: input.requestId,
  });

  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    scope: { tenantId: input.tenantId, ownerId: input.ownerId },
    data: {
      candidateProfile: profile[0] ?? null,
      cvDocuments: cvs,
      integrations,
      schedules,
      searchRuns: runs,
      proposals,
      applications: ownedApplications,
      notificationPreferences: preferences[0] ?? null,
      notifications: ownedNotifications,
      consentHistory: consents,
    },
  };
}

export async function beginOwnedDataErasure(input: OwnedIdentity & {
  requestId: string;
  db?: AppDatabase;
}) {
  const db = input.db ?? getDb();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 30 * 60 * 1_000);
  const idempotencyKey = `privacy:erasure:${input.tenantId}:${input.ownerId}:${input.requestId}`;
  const [request] = await db
    .insert(privacyRequests)
    .values({
      tenantId: input.tenantId,
      ownerId: input.ownerId,
      subjectHash: subjectHash(input.ownerId),
      type: "erasure",
      idempotencyKey,
      confirmationTokenHash: digest(token),
      confirmationExpiresAt: expiresAt,
    })
    .onConflictDoNothing({ target: privacyRequests.idempotencyKey })
    .returning({ id: privacyRequests.id });
  if (!request) return null;
  return { requestId: request.id, token, expiresAt };
}

export async function completeOwnedDataErasure(input: OwnedIdentity & {
  privacyRequestId: string;
  confirmationToken: string;
  db?: AppDatabase;
  deleteObject?: (objectKey: string) => Promise<void>;
}) {
  const db = input.db ?? getDb();
  const deleteObject = input.deleteObject ?? deletePrivateObject;
  const [request] = await db
    .select()
    .from(privacyRequests)
    .where(
      and(
        eq(privacyRequests.id, input.privacyRequestId),
        eq(privacyRequests.tenantId, input.tenantId),
        eq(privacyRequests.ownerId, input.ownerId),
        eq(privacyRequests.type, "erasure"),
      ),
    )
    .limit(1);
  if (
    !request ||
    (request.status !== "pending" && request.status !== "failed") ||
    !request.confirmationTokenHash ||
    !request.confirmationExpiresAt ||
    request.confirmationExpiresAt <= new Date() ||
    digest(input.confirmationToken) !== request.confirmationTokenHash
  ) {
    return null;
  }

  await db
    .update(privacyRequests)
    .set({ status: "processing", failureCode: null, updatedAt: new Date() })
    .where(eq(privacyRequests.id, request.id));
  const documents = await db
    .select({ objectKey: cvDocuments.objectKey })
    .from(cvDocuments)
    .where(
      and(
        eq(cvDocuments.tenantId, input.tenantId),
        eq(cvDocuments.ownerId, input.ownerId),
        ne(cvDocuments.status, "deleted"),
      ),
    );
  try {
    for (const document of documents) await deleteObject(document.objectKey);
  } catch (error) {
    await db
      .update(privacyRequests)
      .set({
        status: "failed",
        failureCode: "object_storage_cleanup_failed",
        updatedAt: new Date(),
      })
      .where(eq(privacyRequests.id, request.id));
    throw error;
  }

  const [workspace] = await db
    .select({ externalKey: tenants.externalKey })
    .from(tenants)
    .where(eq(tenants.id, input.tenantId))
    .limit(1);

  await db.transaction(async (tx) => {
    await tx.delete(searchSchedules).where(and(eq(searchSchedules.tenantId, input.tenantId), eq(searchSchedules.ownerId, input.ownerId)));
    await tx.delete(searchRuns).where(and(eq(searchRuns.tenantId, input.tenantId), eq(searchRuns.ownerId, input.ownerId)));
    await tx.delete(jobProposals).where(and(eq(jobProposals.tenantId, input.tenantId), eq(jobProposals.ownerId, input.ownerId)));
    await tx.delete(cvDocuments).where(and(eq(cvDocuments.tenantId, input.tenantId), eq(cvDocuments.ownerId, input.ownerId)));
    await tx.delete(candidateProfiles).where(and(eq(candidateProfiles.tenantId, input.tenantId), eq(candidateProfiles.ownerId, input.ownerId)));
    await tx.delete(platformIntegrations).where(and(eq(platformIntegrations.tenantId, input.tenantId), eq(platformIntegrations.ownerId, input.ownerId)));
    await tx.delete(notifications).where(and(eq(notifications.tenantId, input.tenantId), eq(notifications.ownerId, input.ownerId)));
    await tx.delete(notificationPreferences).where(and(eq(notificationPreferences.tenantId, input.tenantId), eq(notificationPreferences.ownerId, input.ownerId)));
    await tx.delete(agentSessions).where(and(eq(agentSessions.tenantId, input.tenantId), eq(agentSessions.ownerId, input.ownerId)));
    await tx.delete(supportGrants).where(and(eq(supportGrants.tenantId, input.tenantId), eq(supportGrants.grantedBy, input.ownerId)));
    await tx.delete(auditEvents).where(and(eq(auditEvents.tenantId, input.tenantId), eq(auditEvents.actorId, input.ownerId)));
    await tx.delete(tenantMembers).where(and(eq(tenantMembers.tenantId, input.tenantId), eq(tenantMembers.userId, input.ownerId)));

    if (workspace?.externalKey.startsWith("clerk-user:")) {
      await tx.delete(tenants).where(eq(tenants.id, input.tenantId));
    }
    const [remainingMembership] = await tx
      .select({ userId: tenantMembers.userId })
      .from(tenantMembers)
      .where(eq(tenantMembers.userId, input.ownerId))
      .limit(1);
    if (!remainingMembership) await tx.delete(users).where(eq(users.id, input.ownerId));

    await tx
      .update(privacyRequests)
      .set({
        status: "completed",
        tenantId: null,
        ownerId: null,
        confirmationTokenHash: null,
        confirmationExpiresAt: null,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(privacyRequests.id, request.id));
    await tx
      .update(privacyConsents)
      .set({ tenantId: null, ownerId: null })
      .where(eq(privacyConsents.subjectHash, request.subjectHash));
  });
  return { requestId: request.id, status: "completed" as const };
}

function subjectHash(ownerId: string) {
  return digest(`jobpilot-subject:${ownerId}`);
}

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
