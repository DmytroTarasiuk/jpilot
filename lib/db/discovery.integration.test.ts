import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DiscoveryBatch } from "../discovery/djinni";
import type { AppDatabase } from "./client";
import { executeDjinniDiscoveryRun } from "./discovery";
import {
  applicationDrafts,
  applications,
  approvalRequests,
  candidateProfiles,
  jobPostings,
  jobProposals,
  jobSourceSnapshots,
  schedulePlatforms,
  searchRuns,
  searchSchedules,
  tenants,
  users,
} from "./schema";
import * as schema from "./schema";

describe("Phase 2 discovery persistence", () => {
  let client: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;

  beforeEach(async () => {
    client = new PGlite();
    db = drizzle({ client, schema });
    await migrate(db, { migrationsFolder: "drizzle" });
  });

  afterEach(async () => {
    await client.close();
  });

  it("persists snapshots, deduplicates globally, suppresses prior proposals, and replays safely", async () => {
    const tenantId = randomUUID();
    const ownerId = randomUUID();
    const scheduleId = randomUUID();
    const firstRunId = randomUUID();
    const repeatedRunId = randomUUID();
    const windowStart = new Date("2026-10-24T00:00:00.000Z");
    const windowEnd = new Date("2026-10-25T00:00:00.000Z");

    await db.insert(tenants).values({ id: tenantId, externalKey: "tenant:phase2", name: "Phase 2" });
    await db.insert(users).values({ id: ownerId, clerkUserId: "user_phase2" });
    await db.insert(candidateProfiles).values({
      tenantId,
      ownerId,
      headline: "Senior Software Engineer",
      targetCountries: ["PL"],
      targetTitles: ["Software Engineer"],
      workModes: ["remote"],
      languages: ["English"],
      excludedCompanies: [],
      confirmedAt: new Date("2026-10-20T00:00:00.000Z"),
    });
    await db.insert(searchSchedules).values({
      id: scheduleId,
      tenantId,
      ownerId,
      name: "Phase 2 integration",
      idempotencyKey: "phase2-schedule",
      cadence: "daily",
      timezone: "Europe/Warsaw",
      localTime: "08:00",
      targetCountries: ["PL"],
      desiredEnabled: true,
      enabled: true,
      nextRunAt: windowEnd,
    });
    await db.insert(schedulePlatforms).values({
      scheduleId,
      platform: "djinni",
      searchLimit: 25,
      autoApplyLimit: 0,
    });
    await db.insert(searchRuns).values([
      {
        id: firstRunId,
        tenantId,
        ownerId,
        scheduleId,
        trigger: "manual",
        status: "running",
        idempotencyKey: "phase2-run-1",
        scheduledFor: windowEnd,
        windowStart,
        windowEnd,
      },
      {
        id: repeatedRunId,
        tenantId,
        ownerId,
        scheduleId,
        trigger: "manual",
        status: "running",
        idempotencyKey: "phase2-run-2",
        scheduledFor: windowEnd,
        windowStart,
        windowEnd,
      },
    ]);

    const batch: DiscoveryBatch = {
      platform: "djinni",
      records: [
        {
          platform: "djinni",
          externalId: "845514",
          sourceUrl: "https://djinni.co/jobs/845514-senior-typescript-engineer/?utm_source=rss",
          countryCode: "PL",
          title: "Senior TypeScript Software Engineer",
          descriptionHtml: "<p>Remote TypeScript, Node.js, PostgreSQL and AWS role.</p>",
          publishedAt: "2026-10-24T10:00:00.000Z",
          categories: ["TypeScript", "Node.js"],
          sourcePayload: { guid: "845514", feedCountry: "PL" },
        },
      ],
      failures: [
        {
          externalId: "invalid:missing-date",
          sourceUrl: "https://djinni.co/jobs/rss/?country=POL",
          sourcePayload: { title: "Malformed feed item" },
          failureCode: "publication_date_missing_or_invalid",
          contentHash: "e".repeat(64),
        },
      ],
      diagnostics: {
        feedsRequested: 1,
        sourceItemsRetrieved: 2,
        sourceItemsParsed: 1,
        sourceItemsMalformed: 1,
        rejectedOutsideRunWindow: 0,
        rejectedDuplicateInBatch: 0,
        recordsSelected: 1,
      },
    };
    const discover = vi.fn(async () => batch);
    const productionDb = db as unknown as AppDatabase;

    const first = await executeDjinniDiscoveryRun({ runId: firstRunId, db: productionDb, discover });
    const replay = await executeDjinniDiscoveryRun({ runId: firstRunId, db: productionDb, discover });
    const repeated = await executeDjinniDiscoveryRun({
      runId: repeatedRunId,
      db: productionDb,
      discover,
    });

    expect(first).toEqual({
      found: 2,
      new: 1,
      duplicate: 0,
      eligible: 1,
      proposed: 1,
      failed: 1,
      sourceFeedsRequested: 1,
      sourceItemsRetrieved: 2,
      sourceItemsParsed: 1,
      sourceItemsMalformed: 1,
      rejectedOutsideRunWindow: 0,
      rejectedDuplicateInBatch: 0,
      recordsSelected: 1,
    });
    expect(replay).toEqual(first);
    expect(repeated).toEqual({
      ...first,
      new: 0,
      duplicate: 1,
      proposed: 0,
    });
    expect(await db.select().from(jobPostings)).toHaveLength(1);
    expect(await db.select().from(jobProposals)).toHaveLength(1);
    expect(await db.select().from(applications)).toHaveLength(1);
    expect(await db.select().from(approvalRequests)).toHaveLength(1);
    expect(await db.select().from(applicationDrafts)).toHaveLength(1);
    expect(await db.select().from(jobSourceSnapshots)).toHaveLength(4);
    const [persistedFirstRun] = await db
      .select({ counters: searchRuns.counters })
      .from(searchRuns)
      .where(eq(searchRuns.id, firstRunId));
    expect(persistedFirstRun?.counters).toEqual(first);
  });
});
