import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { and, asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DirectSubmissionAdapter } from "../applications/adapters/types";
import { submitApprovedApplication } from "../applications/submission";
import type { AppDatabase } from "./client";
import {
  correctApplicationStatus,
  decideApplication,
  listOwnedApplications,
  materializeApprovalApplication,
  updateApplicationDraft,
} from "./applications";
import {
  applicationDrafts,
  applicationEvents,
  applications,
  applicationSubmissionAttempts,
  approvalRequests,
  candidateProfiles,
  jobPostings,
  jobProposals,
  searchRuns,
  tenants,
  users,
} from "./schema";
import * as schema from "./schema";

describe("Phase 3 application lifecycle", () => {
  let client: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let productionDb: AppDatabase;

  beforeEach(async () => {
    client = new PGlite();
    db = drizzle({ client, schema });
    productionDb = db as unknown as AppDatabase;
    await migrate(db, { migrationsFolder: "drizzle" });
  });

  afterEach(async () => {
    await client.close();
  });

  it("materializes one tenant-scoped approval and grounded draft across retries", async () => {
    const fixture = await seedProposal(db);
    const input = {
      tenantId: fixture.tenantId,
      ownerId: fixture.ownerId,
      proposalId: fixture.proposalId,
      jobPostingId: fixture.jobPostingId,
      platform: "djinni" as const,
    };

    await materializeApprovalApplication(input, productionDb);
    await materializeApprovalApplication(input, productionDb);

    const owned = await listOwnedApplications(input, productionDb);
    const otherTenant = await listOwnedApplications(
      { tenantId: randomUUID(), ownerId: fixture.ownerId },
      productionDb,
    );
    expect(owned).toHaveLength(1);
    expect(otherTenant).toHaveLength(0);
    expect(owned[0]).toMatchObject({
      status: "approval_required",
      approvalStatus: "pending",
      submissionMode: "manual",
      title: "Senior TypeScript Engineer",
    });
    expect(owned[0]?.coverLetter).toContain("Senior TypeScript Engineer");
    expect(owned[0]?.coverLetter).toContain("Senior Software Engineer");
    expect(owned[0]?.generationMode).toBe("deterministic");
    expect(owned[0]?.events.map((event) => event.toStatus)).toEqual([
      "proposed",
      "approval_required",
    ]);
    expect(await db.select().from(applications)).toHaveLength(1);
    expect(await db.select().from(approvalRequests)).toHaveLength(1);
    expect(await db.select().from(applicationDrafts)).toHaveLength(1);
  });

  it("approves a manual task, records user edits, and appends correction events", async () => {
    const fixture = await seedProposal(db);
    const application = await materializeApprovalApplication(
      { ...fixture, platform: "djinni" },
      productionDb,
    );
    const decision = await decideApplication(
      {
        tenantId: fixture.tenantId,
        ownerId: fixture.ownerId,
        applicationId: application.id,
        decision: "approve",
        requestId: "phase3-approve-request",
      },
      productionDb,
    );
    expect(decision).toMatchObject({ finalStatus: "manual_required", submissionMode: "manual" });

    const draft = await updateApplicationDraft(
      {
        tenantId: fixture.tenantId,
        ownerId: fixture.ownerId,
        applicationId: application.id,
        coverLetter: "User-confirmed cover letter.",
        screeningAnswers: [
          {
            question: "Can you work remotely?",
            answer: "Yes.",
            sourceFactIds: ["profile:work_modes"],
            needsReview: false,
          },
        ],
        requestId: "phase3-draft-request",
      },
      productionDb,
    );
    expect(draft?.revision).toBe(2);

    await correctApplicationStatus(
      {
        tenantId: fixture.tenantId,
        ownerId: fixture.ownerId,
        applicationId: application.id,
        status: "submitted",
        requestId: "phase3-manual-submitted",
      },
      productionDb,
    );
    await correctApplicationStatus(
      {
        tenantId: fixture.tenantId,
        ownerId: fixture.ownerId,
        applicationId: application.id,
        status: "interview",
        requestId: "phase3-interview",
      },
      productionDb,
    );

    const [stored] = await db
      .select()
      .from(applications)
      .where(eq(applications.id, application.id));
    expect(stored).toMatchObject({ status: "interview" });
    expect(stored?.submittedAt).toBeInstanceOf(Date);
    const events = await db
      .select()
      .from(applicationEvents)
      .where(eq(applicationEvents.applicationId, application.id))
      .orderBy(asc(applicationEvents.createdAt));
    expect(events.map((event) => event.toStatus)).toEqual([
      "proposed",
      "approval_required",
      "approved",
      "manual_required",
      "submitted",
      "interview",
    ]);
  });

  it("uses one stable provider idempotency key and reuses a durable receipt", async () => {
    const fixture = await seedProposal(db);
    const application = await materializeApprovalApplication(
      { ...fixture, platform: "djinni" },
      productionDb,
    );
    await db
      .update(applications)
      .set({ submissionMode: "direct" })
      .where(eq(applications.id, application.id));
    await decideApplication(
      {
        tenantId: fixture.tenantId,
        ownerId: fixture.ownerId,
        applicationId: application.id,
        decision: "approve",
        requestId: "phase3-direct-approve",
      },
      productionDb,
    );

    const submit = vi.fn(async (request: { idempotencyKey: string }) => ({
      externalApplicationId: "provider-application-1",
      submittedAt: "2026-10-25T12:00:00.000Z",
      safeReceipt: { receiptId: "safe-receipt-1", idempotencyKey: request.idempotencyKey },
    }));
    const adapter = {
      platform: "djinni",
      capability: "permitted_direct_submit",
      supportsProviderIdempotency: true,
      submit,
    } satisfies DirectSubmissionAdapter;
    const submissionInput = {
      tenantId: fixture.tenantId,
      ownerId: fixture.ownerId,
      applicationId: application.id,
      adapter,
      db: productionDb,
    };

    const first = await submitApprovedApplication(submissionInput);
    const replay = await submitApprovedApplication(submissionInput);

    expect(first).toMatchObject({ status: "submitted" });
    expect(replay).toMatchObject({ status: "submitted" });
    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit.mock.calls[0]?.[0].idempotencyKey).toContain(":submit:v1");
    const [stored] = await db
      .select()
      .from(applications)
      .where(eq(applications.id, application.id));
    expect(stored).toMatchObject({
      status: "submitted",
      externalApplicationId: "provider-application-1",
    });
    expect(await db.select().from(applicationSubmissionAttempts)).toHaveLength(1);
  });

  it("rejects only the owned pending request and cannot decide it twice", async () => {
    const fixture = await seedProposal(db);
    const application = await materializeApprovalApplication(
      { ...fixture, platform: "djinni" },
      productionDb,
    );
    const inaccessible = await decideApplication(
      {
        tenantId: randomUUID(),
        ownerId: fixture.ownerId,
        applicationId: application.id,
        decision: "reject",
        requestId: "phase3-cross-tenant-reject",
      },
      productionDb,
    );
    expect(inaccessible).toBeNull();

    const rejected = await decideApplication(
      {
        tenantId: fixture.tenantId,
        ownerId: fixture.ownerId,
        applicationId: application.id,
        decision: "reject",
        reason: "Not interested.",
        requestId: "phase3-owned-reject",
      },
      productionDb,
    );
    const replay = await decideApplication(
      {
        tenantId: fixture.tenantId,
        ownerId: fixture.ownerId,
        applicationId: application.id,
        decision: "approve",
        requestId: "phase3-decide-twice",
      },
      productionDb,
    );
    expect(rejected).toMatchObject({ finalStatus: "dismissed" });
    expect(replay).toBeNull();
    const [approval] = await db
      .select()
      .from(approvalRequests)
      .where(and(eq(approvalRequests.applicationId, application.id), eq(approvalRequests.status, "rejected")));
    expect(approval?.decisionReason).toBe("Not interested.");
  });
});

async function seedProposal(db: ReturnType<typeof drizzle<typeof schema>>) {
  const tenantId = randomUUID();
  const ownerId = randomUUID();
  const runId = randomUUID();
  const jobPostingId = randomUUID();
  const proposalId = randomUUID();
  await db.insert(tenants).values({ id: tenantId, externalKey: `tenant:${tenantId}`, name: "Phase 3" });
  await db.insert(users).values({ id: ownerId, clerkUserId: `user:${ownerId}` });
  await db.insert(candidateProfiles).values({
    tenantId,
    ownerId,
    displayName: "Dmytro T.",
    headline: "Senior Software Engineer",
    targetCountries: ["PL"],
    targetTitles: ["Software Engineer"],
    workModes: ["remote"],
    languages: ["English"],
    excludedCompanies: [],
    confirmedAt: new Date("2026-10-20T00:00:00.000Z"),
  });
  await db.insert(searchRuns).values({
    id: runId,
    tenantId,
    ownerId,
    trigger: "manual",
    status: "completed",
    idempotencyKey: `run:${runId}`,
    scheduledFor: new Date("2026-10-25T08:00:00.000Z"),
    windowStart: new Date("2026-10-24T00:00:00.000Z"),
    windowEnd: new Date("2026-10-25T00:00:00.000Z"),
  });
  await db.insert(jobPostings).values({
    id: jobPostingId,
    platform: "djinni",
    externalId: `job:${jobPostingId}`,
    canonicalUrl: "https://djinni.co/jobs/12345-senior-typescript-engineer/",
    title: "Senior TypeScript Engineer",
    company: "Acme",
    countryCode: "PL",
    remote: true,
    publishedAt: new Date("2026-10-24T10:00:00.000Z"),
    publicationDateVerified: true,
    firstSeenRunId: runId,
    contentHash: "a".repeat(64),
    sourcePayload: { guid: "12345" },
  });
  await db.insert(jobProposals).values({
    id: proposalId,
    tenantId,
    ownerId,
    runId,
    jobPostingId,
    matchScore: 88,
    reasons: ["Title and remote preference match."],
    concerns: [],
  });
  return { tenantId, ownerId, runId, jobPostingId, proposalId };
}

