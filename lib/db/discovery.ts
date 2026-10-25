import { and, eq } from "drizzle-orm";
import {
  discoverDjinniVacancies,
  type DiscoveryBatch,
} from "../discovery/djinni";
import {
  normalizeVacancy,
  scoreVacancy,
  sha256,
  type NormalizedVacancy,
  type TargetCountryCode,
} from "../domain/job";
import { getActiveCvDocumentForMatching } from "./cv-documents";
import { materializeApprovalApplication } from "./applications";
import { getDb, type AppDatabase } from "./client";
import {
  candidateProfiles,
  jobPostings,
  jobProposals,
  jobSourceSnapshots,
  platformIntegrations,
  schedulePlatforms,
  searchRuns,
  searchSchedules,
} from "./schema";

export interface SearchRunCounters {
  [key: string]: number;
  found: number;
  new: number;
  duplicate: number;
  eligible: number;
  proposed: number;
  failed: number;
}

type DiscoverDjinni = typeof discoverDjinniVacancies;

export async function executeDjinniDiscoveryRun(input: {
  runId: string;
  db?: AppDatabase;
  discover?: DiscoverDjinni;
}) {
  const db = input.db ?? getDb();
  const context = await loadDiscoveryContext(db, input.runId);
  const discover = input.discover ?? discoverDjinniVacancies;
  const batch = await discover({
    targetCountries: context.targetCountries,
    windowStart: context.windowStart,
    windowEnd: context.windowEnd,
    limit: context.searchLimit,
  });

  await persistSourceFailures(db, {
    runId: input.runId,
    tenantId: context.tenantId,
    ownerId: context.ownerId,
    batch,
  });
  for (const source of batch.records) {
    let normalized: NormalizedVacancy;
    try {
      normalized = normalizeVacancy(source);
    } catch (error) {
      await persistNormalizationFailure(db, {
        runId: input.runId,
        tenantId: context.tenantId,
        ownerId: context.ownerId,
        source,
        error,
      });
      continue;
    }

    const snapshot = await stageSourceSnapshot(db, {
      runId: input.runId,
      tenantId: context.tenantId,
      ownerId: context.ownerId,
      source,
      normalized,
    });
    if (
      snapshot.failureCode ||
      (snapshot.jobPostingId &&
        snapshot.isNew !== null &&
        snapshot.eligible !== null &&
        snapshot.proposed !== null)
    ) {
      continue;
    }

    const storedNormalized = snapshot.normalizedPayload
      ? (snapshot.normalizedPayload as unknown as NormalizedVacancy)
      : normalized;
    const posting = await upsertJobPosting(db, input.runId, source.sourcePayload, storedNormalized);
    const match = scoreVacancy({
      vacancy: storedNormalized,
      profile: context.profile,
      windowStart: context.windowStart,
      windowEnd: context.windowEnd,
    });
    const proposal = match.shouldPropose
      ? await upsertProposal(db, {
          runId: input.runId,
          tenantId: context.tenantId,
          ownerId: context.ownerId,
          jobPostingId: posting.id,
          score: match.score,
          reasons: match.reasons,
          concerns: match.concerns,
        })
      : null;
    if (proposal?.belongsToRun) {
      await materializeApprovalApplication(
        {
          tenantId: context.tenantId,
          ownerId: context.ownerId,
          proposalId: proposal.id,
          jobPostingId: posting.id,
          platform: "djinni",
        },
        db,
      );
    }
    const proposed = proposal?.createdInRun ?? false;

    await db
      .update(jobSourceSnapshots)
      .set({
        jobPostingId: posting.id,
        isNew: posting.firstSeenRunId === input.runId,
        eligible: match.eligible,
        proposed,
        matchScore: match.score,
        reasons: match.reasons,
        concerns: match.concerns,
        hardFilterFailures: match.hardFilterFailures,
        updatedAt: new Date(),
      })
      .where(eq(jobSourceSnapshots.id, snapshot.id));
  }

  const counters = await recalculateSearchRunCounters(db, input.runId);
  const diagnosticCounters = {
    ...counters,
    sourceFeedsRequested: batch.diagnostics.feedsRequested,
    sourceItemsRetrieved: batch.diagnostics.sourceItemsRetrieved,
    sourceItemsParsed: batch.diagnostics.sourceItemsParsed,
    sourceItemsMalformed: batch.diagnostics.sourceItemsMalformed,
    rejectedOutsideRunWindow: batch.diagnostics.rejectedOutsideRunWindow,
    rejectedDuplicateInBatch: batch.diagnostics.rejectedDuplicateInBatch,
    recordsSelected: batch.diagnostics.recordsSelected,
  };
  await db
    .update(searchRuns)
    .set({ counters: diagnosticCounters, updatedAt: new Date() })
    .where(eq(searchRuns.id, input.runId));
  await db
    .update(platformIntegrations)
    .set({ lastVerifiedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(platformIntegrations.tenantId, context.tenantId),
        eq(platformIntegrations.ownerId, context.ownerId),
        eq(platformIntegrations.platform, "djinni"),
        eq(platformIntegrations.status, "connected"),
      ),
    );
  return diagnosticCounters;
}

export async function recalculateSearchRunCounters(
  db: AppDatabase,
  runId: string,
): Promise<SearchRunCounters> {
  const snapshots = await db
    .select({
      failureCode: jobSourceSnapshots.failureCode,
      isNew: jobSourceSnapshots.isNew,
      eligible: jobSourceSnapshots.eligible,
      proposed: jobSourceSnapshots.proposed,
    })
    .from(jobSourceSnapshots)
    .where(eq(jobSourceSnapshots.runId, runId));
  const counters = snapshots.reduce<SearchRunCounters>(
    (current, snapshot) => ({
      found: current.found + 1,
      new: current.new + (snapshot.failureCode === null && snapshot.isNew === true ? 1 : 0),
      duplicate:
        current.duplicate + (snapshot.failureCode === null && snapshot.isNew === false ? 1 : 0),
      eligible: current.eligible + (snapshot.eligible === true ? 1 : 0),
      proposed: current.proposed + (snapshot.proposed === true ? 1 : 0),
      failed: current.failed + (snapshot.failureCode !== null ? 1 : 0),
    }),
    { found: 0, new: 0, duplicate: 0, eligible: 0, proposed: 0, failed: 0 },
  );
  await db
    .update(searchRuns)
    .set({ counters, updatedAt: new Date() })
    .where(eq(searchRuns.id, runId));
  return counters;
}

async function loadDiscoveryContext(db: AppDatabase, runId: string) {
  const [run] = await db
    .select({
      tenantId: searchRuns.tenantId,
      ownerId: searchRuns.ownerId,
      windowStart: searchRuns.windowStart,
      windowEnd: searchRuns.windowEnd,
      targetCountries: searchSchedules.targetCountries,
      searchLimit: schedulePlatforms.searchLimit,
    })
    .from(searchRuns)
    .innerJoin(searchSchedules, eq(searchRuns.scheduleId, searchSchedules.id))
    .innerJoin(
      schedulePlatforms,
      and(
        eq(schedulePlatforms.scheduleId, searchSchedules.id),
        eq(schedulePlatforms.platform, "djinni"),
        eq(schedulePlatforms.enabled, true),
      ),
    )
    .where(eq(searchRuns.id, runId))
    .limit(1);
  if (!run) throw new Error("djinni_discovery_context_not_found");

  const [profiles, activeDocument] = await Promise.all([
    db
      .select()
      .from(candidateProfiles)
      .where(
        and(
          eq(candidateProfiles.tenantId, run.tenantId),
          eq(candidateProfiles.ownerId, run.ownerId),
        ),
      )
      .limit(1),
    getActiveCvDocumentForMatching(
      { tenantId: run.tenantId, ownerId: run.ownerId },
      db,
    ),
  ]);
  const profile = profiles[0];
  const targetCountries = run.targetCountries.filter(
    (country): country is TargetCountryCode => country === "PL" || country === "UA",
  );
  if (targetCountries.length === 0) throw new Error("target_countries_not_supported");

  return {
    ...run,
    targetCountries,
    profile: {
      headline: profile?.headline ?? null,
      targetCountries,
      targetTitles: profile?.targetTitles ?? [],
      workModes: profile?.workModes ?? [],
      languages: profile?.languages ?? [],
      excludedCompanies: profile?.excludedCompanies ?? [],
      salaryMin: profile?.salaryMin ?? null,
      cvText: activeDocument?.parsedText ?? null,
    },
  };
}

async function persistSourceFailures(
  db: AppDatabase,
  input: { runId: string; tenantId: string; ownerId: string; batch: DiscoveryBatch },
) {
  if (input.batch.failures.length === 0) return;
  await db
    .insert(jobSourceSnapshots)
    .values(
      input.batch.failures.map((failure) => ({
        runId: input.runId,
        tenantId: input.tenantId,
        ownerId: input.ownerId,
        platform: input.batch.platform,
        externalId: failure.externalId,
        sourceUrl: failure.sourceUrl,
        contentHash: failure.contentHash,
        sourcePayload: failure.sourcePayload,
        failureCode: failure.failureCode.slice(0, 128),
      })),
    )
    .onConflictDoNothing({
      target: [
        jobSourceSnapshots.runId,
        jobSourceSnapshots.platform,
        jobSourceSnapshots.externalId,
      ],
    });
}

async function persistNormalizationFailure(
  db: AppDatabase,
  input: {
    runId: string;
    tenantId: string;
    ownerId: string;
    source: DiscoveryBatch["records"][number];
    error: unknown;
  },
) {
  await db
    .insert(jobSourceSnapshots)
    .values({
      runId: input.runId,
      tenantId: input.tenantId,
      ownerId: input.ownerId,
      platform: input.source.platform,
      externalId: input.source.externalId,
      sourceUrl: input.source.sourceUrl,
      contentHash: sha256(JSON.stringify(input.source.sourcePayload)),
      sourcePayload: input.source.sourcePayload,
      failureCode: (input.error instanceof Error ? input.error.message : "normalization_failed").slice(0, 128),
    })
    .onConflictDoNothing({
      target: [
        jobSourceSnapshots.runId,
        jobSourceSnapshots.platform,
        jobSourceSnapshots.externalId,
      ],
    });
}

async function stageSourceSnapshot(
  db: AppDatabase,
  input: {
    runId: string;
    tenantId: string;
    ownerId: string;
    source: DiscoveryBatch["records"][number];
    normalized: NormalizedVacancy;
  },
) {
  const [inserted] = await db
    .insert(jobSourceSnapshots)
    .values({
      runId: input.runId,
      tenantId: input.tenantId,
      ownerId: input.ownerId,
      platform: input.source.platform,
      externalId: input.source.externalId,
      sourceUrl: input.source.sourceUrl,
      contentHash: sha256(JSON.stringify(input.source.sourcePayload)),
      sourcePayload: input.source.sourcePayload,
      normalizedPayload: input.normalized as unknown as Record<string, unknown>,
    })
    .onConflictDoNothing({
      target: [
        jobSourceSnapshots.runId,
        jobSourceSnapshots.platform,
        jobSourceSnapshots.externalId,
      ],
    })
    .returning();
  if (inserted) return inserted;
  const [existing] = await db
    .select()
    .from(jobSourceSnapshots)
    .where(
      and(
        eq(jobSourceSnapshots.runId, input.runId),
        eq(jobSourceSnapshots.platform, input.source.platform),
        eq(jobSourceSnapshots.externalId, input.source.externalId),
      ),
    )
    .limit(1);
  if (!existing) throw new Error("source_snapshot_not_found_after_conflict");
  return existing;
}

async function upsertJobPosting(
  db: AppDatabase,
  runId: string,
  sourcePayload: Record<string, unknown>,
  vacancy: NormalizedVacancy,
) {
  const now = new Date();
  const values = {
    platform: vacancy.platform,
    externalId: vacancy.externalId,
    canonicalUrl: vacancy.canonicalUrl,
    title: vacancy.title,
    company: vacancy.company,
    countryCode: vacancy.countryCode,
    city: vacancy.city,
    remote: vacancy.workMode === "remote",
    publishedAt: vacancy.publishedAt ? new Date(vacancy.publishedAt) : null,
    publicationDateVerified: vacancy.publicationDateVerified,
    firstSeenRunId: runId,
    contentHash: vacancy.contentHash,
    sourcePayload,
  } as const;
  const [inserted] = await db
    .insert(jobPostings)
    .values(values)
    .onConflictDoNothing({ target: [jobPostings.platform, jobPostings.externalId] })
    .returning({ id: jobPostings.id, firstSeenRunId: jobPostings.firstSeenRunId });
  if (inserted) return inserted;

  await db
    .update(jobPostings)
    .set({
      canonicalUrl: values.canonicalUrl,
      title: values.title,
      company: values.company,
      countryCode: values.countryCode,
      city: values.city,
      remote: values.remote,
      publishedAt: values.publishedAt,
      publicationDateVerified: values.publicationDateVerified,
      contentHash: values.contentHash,
      sourcePayload,
      lastSeenAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(jobPostings.platform, vacancy.platform),
        eq(jobPostings.externalId, vacancy.externalId),
      ),
    );
  const [existing] = await db
    .select({ id: jobPostings.id, firstSeenRunId: jobPostings.firstSeenRunId })
    .from(jobPostings)
    .where(
      and(
        eq(jobPostings.platform, vacancy.platform),
        eq(jobPostings.externalId, vacancy.externalId),
      ),
    )
    .limit(1);
  if (!existing) throw new Error("job_posting_not_found_after_conflict");
  return existing;
}

async function upsertProposal(
  db: AppDatabase,
  input: {
    runId: string;
    tenantId: string;
    ownerId: string;
    jobPostingId: string;
    score: number;
    reasons: string[];
    concerns: string[];
  },
) {
  const [inserted] = await db
    .insert(jobProposals)
    .values({
      tenantId: input.tenantId,
      ownerId: input.ownerId,
      runId: input.runId,
      jobPostingId: input.jobPostingId,
      matchScore: input.score,
      reasons: input.reasons,
      concerns: input.concerns,
    })
    .onConflictDoNothing({
      target: [jobProposals.tenantId, jobProposals.ownerId, jobProposals.jobPostingId],
    })
    .returning({ id: jobProposals.id, runId: jobProposals.runId });
  const [proposal] = await db
    .select({ id: jobProposals.id, runId: jobProposals.runId })
    .from(jobProposals)
    .where(
      and(
        eq(jobProposals.tenantId, input.tenantId),
        eq(jobProposals.ownerId, input.ownerId),
        eq(jobProposals.jobPostingId, input.jobPostingId),
      ),
    )
    .limit(1);
  if (!proposal) throw new Error("job_proposal_not_found_after_conflict");
  return {
    id: proposal.id,
    belongsToRun: proposal.runId === input.runId,
    createdInRun: inserted?.runId === input.runId,
  };
}
