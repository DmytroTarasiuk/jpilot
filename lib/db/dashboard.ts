import { and, asc, count, eq, inArray, isNotNull } from "drizzle-orm";
import { getDb } from "./client";
import {
  applications,
  approvalRequests,
  candidateProfiles,
  cvDocuments,
  jobProposals,
  platformIntegrations,
  searchSchedules,
} from "./schema";

export async function getDashboardSummary(input: { tenantId: string; ownerId: string }) {
  const db = getDb();
  const [proposalCount, approvalCount, submittedCount, profile, activeCv, schedules, integrations] =
    await Promise.all([
      db
        .select({ value: count() })
        .from(jobProposals)
        .where(
          and(
            eq(jobProposals.tenantId, input.tenantId),
            eq(jobProposals.ownerId, input.ownerId),
            inArray(jobProposals.status, ["proposed", "approval_required"]),
          ),
        ),
      db
        .select({ value: count() })
        .from(approvalRequests)
        .innerJoin(applications, eq(approvalRequests.applicationId, applications.id))
        .where(
          and(
            eq(approvalRequests.tenantId, input.tenantId),
            eq(applications.ownerId, input.ownerId),
            eq(approvalRequests.status, "pending"),
          ),
        ),
      db
        .select({ value: count() })
        .from(applications)
        .where(
          and(
            eq(applications.tenantId, input.tenantId),
            eq(applications.ownerId, input.ownerId),
            isNotNull(applications.submittedAt),
          ),
        ),
      db
        .select({ id: candidateProfiles.id })
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
        .select({ id: cvDocuments.id })
        .from(cvDocuments)
        .where(
          and(
            eq(cvDocuments.tenantId, input.tenantId),
            eq(cvDocuments.ownerId, input.ownerId),
            eq(cvDocuments.isActive, true),
            eq(cvDocuments.processingStatus, "confirmed"),
          ),
        )
        .limit(1),
      db
        .select({
          id: searchSchedules.id,
          name: searchSchedules.name,
          enabled: searchSchedules.enabled,
          desiredEnabled: searchSchedules.desiredEnabled,
          timezone: searchSchedules.timezone,
          nextRunAt: searchSchedules.nextRunAt,
        })
        .from(searchSchedules)
        .where(
          and(
            eq(searchSchedules.tenantId, input.tenantId),
            eq(searchSchedules.ownerId, input.ownerId),
          ),
        )
        .orderBy(asc(searchSchedules.nextRunAt)),
      db
        .select({ id: platformIntegrations.id })
        .from(platformIntegrations)
        .where(
          and(
            eq(platformIntegrations.tenantId, input.tenantId),
            eq(platformIntegrations.ownerId, input.ownerId),
            eq(platformIntegrations.status, "connected"),
          ),
        ),
    ]);

  return {
    metrics: {
      proposed: proposalCount[0]?.value ?? 0,
      approvalRequired: approvalCount[0]?.value ?? 0,
      submitted: submittedCount[0]?.value ?? 0,
    },
    onboarding: {
      profile: profile.length > 0,
      cv: activeCv.length > 0,
      schedule: schedules.length > 0,
      integration: integrations.length > 0,
    },
    nextSchedule: schedules[0] ?? null,
  };
}
