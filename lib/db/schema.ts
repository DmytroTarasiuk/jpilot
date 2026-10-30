import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import type { CvExtractedProfile } from "../domain/profile";

const createdAt = timestamp("created_at", { withTimezone: true, mode: "date" })
  .defaultNow()
  .notNull();
const updatedAt = timestamp("updated_at", { withTimezone: true, mode: "date" })
  .defaultNow()
  .notNull();

export const memberRoleEnum = pgEnum("member_role", ["owner", "admin", "member"]);
export const platformEnum = pgEnum("job_platform", [
  "linkedin",
  "just_join_it",
  "no_fluff_jobs",
  "dou",
  "djinni",
]);
export const integrationStatusEnum = pgEnum("integration_status", [
  "disconnected",
  "pending",
  "connected",
  "degraded",
  "revoked",
]);
export const cvStatusEnum = pgEnum("cv_status", [
  "pending_upload",
  "ready",
  "quarantined",
  "deleting",
  "deleted",
]);
export const cvProcessingStatusEnum = pgEnum("cv_processing_status", [
  "pending",
  "scanning",
  "parsing",
  "awaiting_confirmation",
  "confirmed",
  "failed",
]);
export const cvScanStatusEnum = pgEnum("cv_scan_status", [
  "pending",
  "clean",
  "skipped",
  "infected",
  "error",
  "unavailable",
]);
export const scheduleCadenceEnum = pgEnum("schedule_cadence", ["daily", "weekly"]);
export const runTriggerEnum = pgEnum("run_trigger", ["manual", "scheduled", "catch_up"]);
export const runStatusEnum = pgEnum("run_status", [
  "queued",
  "leased",
  "running",
  "completed",
  "partially_completed",
  "failed",
  "cancelled",
]);
export const proposalStatusEnum = pgEnum("proposal_status", [
  "proposed",
  "approval_required",
  "approved",
  "manual_required",
  "dismissed",
  "expired",
]);
export const applicationStatusEnum = pgEnum("application_status", [
  "discovered",
  "proposed",
  "approval_required",
  "approved",
  "manual_required",
  "applying",
  "submitted",
  "acknowledged",
  "interview",
  "rejected",
  "offer",
  "withdrawn",
  "failed",
  "outcome_unknown",
  "dismissed",
  "expired",
]);
export const approvalStatusEnum = pgEnum("approval_status", [
  "pending",
  "approved",
  "rejected",
  "expired",
  "cancelled",
]);
export const submissionAttemptStatusEnum = pgEnum("submission_attempt_status", [
  "pending",
  "submitted",
  "failed",
  "outcome_unknown",
]);
export const actorTypeEnum = pgEnum("actor_type", ["user", "agent", "system", "connector"]);
export const connectorHealthEnum = pgEnum("connector_health", ["healthy", "degraded", "open"]);
export const notificationSeverityEnum = pgEnum("notification_severity", ["info", "warning", "error"]);
export const notificationDeliveryStatusEnum = pgEnum("notification_delivery_status", [
  "pending",
  "sending",
  "sent",
  "failed",
  "skipped",
]);
export const privacyRequestTypeEnum = pgEnum("privacy_request_type", ["export", "erasure"]);
export const privacyRequestStatusEnum = pgEnum("privacy_request_status", [
  "pending",
  "processing",
  "completed",
  "failed",
  "cancelled",
]);

export type PlatformKey = (typeof platformEnum.enumValues)[number];
export type ApplicationStatus = (typeof applicationStatusEnum.enumValues)[number];
export interface ApplicationSourceFact {
  id: string;
  label: string;
  value: string;
  source: "confirmed_profile" | "confirmed_cv";
}

export interface ScreeningAnswerDraft {
  question: string;
  answer: string | null;
  sourceFactIds: string[];
  needsReview: boolean;
}

export const tenants = pgTable(
  "tenants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    externalKey: text("external_key").notNull(),
    name: text("name").notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [uniqueIndex("tenants_external_key_unique").on(table.externalKey)],
);

export const users = pgTable(
  "app_users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clerkUserId: text("clerk_user_id").notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [uniqueIndex("app_users_clerk_user_id_unique").on(table.clerkUserId)],
);

export const tenantMembers = pgTable(
  "tenant_members",
  {
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: memberRoleEnum("role").default("member").notNull(),
    active: boolean("active").default(true).notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.userId], name: "tenant_members_pk" }),
    index("tenant_members_user_idx").on(table.userId),
  ],
);

export const candidateProfiles = pgTable(
  "candidate_profiles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    displayName: text("display_name"),
    headline: text("headline"),
    targetCountries: text("target_countries").array().default(sql`ARRAY[]::text[]`).notNull(),
    targetTitles: text("target_titles").array().default(sql`ARRAY[]::text[]`).notNull(),
    workModes: text("work_modes").array().default(sql`ARRAY[]::text[]`).notNull(),
    languages: text("languages").array().default(sql`ARRAY[]::text[]`).notNull(),
    excludedCompanies: text("excluded_companies").array().default(sql`ARRAY[]::text[]`).notNull(),
    salaryMin: integer("salary_min"),
    salaryCurrency: varchar("salary_currency", { length: 3 }).default("PLN").notNull(),
    salaryPeriod: varchar("salary_period", { length: 16 }).default("monthly").notNull(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true, mode: "date" }),
    profileFacts: jsonb("profile_facts").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("candidate_profiles_tenant_owner_unique").on(table.tenantId, table.ownerId),
    index("candidate_profiles_tenant_idx").on(table.tenantId),
  ],
);

export const cvDocuments = pgTable(
  "cv_documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: cvStatusEnum("status").default("pending_upload").notNull(),
    objectKey: text("object_key").notNull(),
    originalName: text("original_name").notNull(),
    contentType: varchar("content_type", { length: 128 }).notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    sha256: varchar("sha256", { length: 64 }),
    isActive: boolean("is_active").default(false).notNull(),
    processingStatus: cvProcessingStatusEnum("processing_status").default("pending").notNull(),
    scanStatus: cvScanStatusEnum("scan_status").default("pending").notNull(),
    workflowRunId: text("workflow_run_id"),
    parsedText: text("parsed_text"),
    extractedProfile: jsonb("extracted_profile").$type<CvExtractedProfile>(),
    processingErrorCode: varchar("processing_error_code", { length: 128 }),
    scannedAt: timestamp("scanned_at", { withTimezone: true, mode: "date" }),
    parsedAt: timestamp("parsed_at", { withTimezone: true, mode: "date" }),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true, mode: "date" }),
    deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "date" }),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("cv_documents_object_key_unique").on(table.objectKey),
    uniqueIndex("cv_documents_workflow_run_unique").on(table.workflowRunId),
    uniqueIndex("cv_documents_one_active_per_owner_unique")
      .on(table.tenantId, table.ownerId)
      .where(sql`${table.isActive} = true`),
    index("cv_documents_tenant_owner_idx").on(table.tenantId, table.ownerId),
    check("cv_documents_size_positive", sql`${table.sizeBytes} > 0`),
  ],
);

export const platformIntegrations = pgTable(
  "platform_integrations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    platform: platformEnum("platform").notNull(),
    status: integrationStatusEnum("status").default("disconnected").notNull(),
    authMode: varchar("auth_mode", { length: 64 }),
    secretReference: text("secret_reference"),
    externalAccountReference: text("external_account_reference"),
    capabilities: jsonb("capabilities")
      .$type<{ discover: boolean; prepare: boolean; submit: boolean; track: boolean }>()
      .default({ discover: false, prepare: false, submit: false, track: false })
      .notNull(),
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true, mode: "date" }),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("platform_integrations_owner_platform_unique").on(
      table.tenantId,
      table.ownerId,
      table.platform,
    ),
  ],
);

// One row per upstream source coordinates process-independent rate limits and
// circuit state across all tenants and Vercel function instances.
export const connectorRuntimeStates = pgTable(
  "connector_runtime_states",
  {
    platform: platformEnum("platform").primaryKey(),
    health: connectorHealthEnum("health").default("healthy").notNull(),
    consecutiveFailures: integer("consecutive_failures").default(0).notNull(),
    nextRequestAt: timestamp("next_request_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    circuitOpenUntil: timestamp("circuit_open_until", { withTimezone: true, mode: "date" }),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true, mode: "date" }),
    lastSuccessAt: timestamp("last_success_at", { withTimezone: true, mode: "date" }),
    lastFailureAt: timestamp("last_failure_at", { withTimezone: true, mode: "date" }),
    lastFailureCode: varchar("last_failure_code", { length: 128 }),
    lastLatencyMs: integer("last_latency_ms"),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("connector_runtime_states_health_idx").on(table.health, table.circuitOpenUntil),
    check("connector_runtime_states_failures_nonnegative", sql`${table.consecutiveFailures} >= 0`),
    check("connector_runtime_states_latency_nonnegative", sql`${table.lastLatencyMs} IS NULL OR ${table.lastLatencyMs} >= 0`),
  ],
);

export const searchSchedules = pgTable(
  "search_schedules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    cadence: scheduleCadenceEnum("cadence").notNull(),
    timezone: varchar("timezone", { length: 128 }).notNull(),
    localTime: varchar("local_time", { length: 5 }).notNull(),
    dayOfWeek: integer("day_of_week"),
    targetCountries: text("target_countries").array().notNull(),
    desiredEnabled: boolean("desired_enabled").default(true).notNull(),
    enabled: boolean("enabled").default(false).notNull(),
    maxAgeDays: integer("max_age_days").default(7).notNull(),
    nextRunAt: timestamp("next_run_at", { withTimezone: true, mode: "date" }).notNull(),
    lastSuccessfulWindowEnd: timestamp("last_successful_window_end", {
      withTimezone: true,
      mode: "date",
    }),
    leaseToken: uuid("lease_token"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true, mode: "date" }),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("search_schedules_due_idx").on(table.enabled, table.nextRunAt),
    index("search_schedules_tenant_owner_idx").on(table.tenantId, table.ownerId),
    uniqueIndex("search_schedules_idempotency_unique").on(table.idempotencyKey),
    check("search_schedules_max_age", sql`${table.maxAgeDays} BETWEEN 1 AND 7`),
    check("search_schedules_weekday", sql`${table.dayOfWeek} IS NULL OR ${table.dayOfWeek} BETWEEN 0 AND 6`),
  ],
);

export const schedulePlatforms = pgTable(
  "schedule_platforms",
  {
    scheduleId: uuid("schedule_id")
      .notNull()
      .references(() => searchSchedules.id, { onDelete: "cascade" }),
    platform: platformEnum("platform").notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    searchLimit: integer("search_limit").default(25).notNull(),
    autoApplyLimit: integer("auto_apply_limit").default(0).notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [
    primaryKey({ columns: [table.scheduleId, table.platform], name: "schedule_platforms_pk" }),
    check("schedule_platforms_search_limit", sql`${table.searchLimit} BETWEEN 1 AND 100`),
    check("schedule_platforms_auto_limit", sql`${table.autoApplyLimit} BETWEEN 0 AND 25`),
    check("schedule_platforms_limit_order", sql`${table.autoApplyLimit} <= ${table.searchLimit}`),
  ],
);

export const searchRuns = pgTable(
  "search_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    scheduleId: uuid("schedule_id").references(() => searchSchedules.id, { onDelete: "set null" }),
    trigger: runTriggerEnum("trigger").notNull(),
    status: runStatusEnum("status").default("queued").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true, mode: "date" }).notNull(),
    windowStart: timestamp("window_start", { withTimezone: true, mode: "date" }).notNull(),
    windowEnd: timestamp("window_end", { withTimezone: true, mode: "date" }).notNull(),
    scheduleLeaseToken: uuid("schedule_lease_token"),
    workflowRunId: text("workflow_run_id"),
    counters: jsonb("counters")
      .$type<Record<string, number>>()
      .default({ found: 0, new: 0, duplicate: 0, eligible: 0, proposed: 0, failed: 0 })
      .notNull(),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
    failureCode: varchar("failure_code", { length: 128 }),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("search_runs_idempotency_unique").on(table.idempotencyKey),
    uniqueIndex("search_runs_workflow_run_unique").on(table.workflowRunId),
    index("search_runs_tenant_created_idx").on(table.tenantId, table.createdAt),
    check("search_runs_valid_window", sql`${table.windowStart} < ${table.windowEnd}`),
  ],
);

export const jobPostings = pgTable(
  "job_postings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    platform: platformEnum("platform").notNull(),
    externalId: text("external_id").notNull(),
    canonicalUrl: text("canonical_url").notNull(),
    title: text("title").notNull(),
    company: text("company").notNull(),
    countryCode: varchar("country_code", { length: 2 }).notNull(),
    city: text("city"),
    remote: boolean("remote").default(false).notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true, mode: "date" }),
    publicationDateVerified: boolean("publication_date_verified").default(false).notNull(),
    firstSeenRunId: uuid("first_seen_run_id").references(() => searchRuns.id, {
      onDelete: "set null",
    }),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    contentHash: varchar("content_hash", { length: 64 }).notNull(),
    sourcePayload: jsonb("source_payload").$type<Record<string, unknown>>().notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("job_postings_platform_external_unique").on(table.platform, table.externalId),
    index("job_postings_published_idx").on(table.publishedAt),
  ],
);

export const jobSourceSnapshots = pgTable(
  "job_source_snapshots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    runId: uuid("run_id")
      .notNull()
      .references(() => searchRuns.id, { onDelete: "cascade" }),
    platform: platformEnum("platform").notNull(),
    externalId: text("external_id").notNull(),
    jobPostingId: uuid("job_posting_id").references(() => jobPostings.id, {
      onDelete: "set null",
    }),
    sourceUrl: text("source_url").notNull(),
    contentHash: varchar("content_hash", { length: 64 }).notNull(),
    sourcePayload: jsonb("source_payload").$type<Record<string, unknown>>().notNull(),
    normalizedPayload: jsonb("normalized_payload").$type<Record<string, unknown>>(),
    isNew: boolean("is_new"),
    eligible: boolean("eligible"),
    proposed: boolean("proposed"),
    matchScore: integer("match_score"),
    reasons: jsonb("reasons").$type<string[]>().default([]).notNull(),
    concerns: jsonb("concerns").$type<string[]>().default([]).notNull(),
    hardFilterFailures: jsonb("hard_filter_failures").$type<string[]>().default([]).notNull(),
    failureCode: varchar("failure_code", { length: 128 }),
    capturedAt: timestamp("captured_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt,
  },
  (table) => [
    uniqueIndex("job_source_snapshots_run_platform_external_unique").on(
      table.runId,
      table.platform,
      table.externalId,
    ),
    index("job_source_snapshots_tenant_owner_run_idx").on(
      table.tenantId,
      table.ownerId,
      table.runId,
    ),
    index("job_source_snapshots_job_idx").on(table.jobPostingId),
    check(
      "job_source_snapshots_score_range",
      sql`${table.matchScore} IS NULL OR ${table.matchScore} BETWEEN 0 AND 100`,
    ),
  ],
);

export const jobProposals = pgTable(
  "job_proposals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    runId: uuid("run_id")
      .notNull()
      .references(() => searchRuns.id, { onDelete: "cascade" }),
    jobPostingId: uuid("job_posting_id")
      .notNull()
      .references(() => jobPostings.id, { onDelete: "cascade" }),
    status: proposalStatusEnum("status").default("proposed").notNull(),
    matchScore: integer("match_score").notNull(),
    reasons: jsonb("reasons").$type<string[]>().default([]).notNull(),
    concerns: jsonb("concerns").$type<string[]>().default([]).notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("job_proposals_tenant_owner_job_unique").on(
      table.tenantId,
      table.ownerId,
      table.jobPostingId,
    ),
    index("job_proposals_tenant_status_idx").on(table.tenantId, table.status),
    check("job_proposals_score_range", sql`${table.matchScore} BETWEEN 0 AND 100`),
  ],
);

export const applications = pgTable(
  "applications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    proposalId: uuid("proposal_id")
      .notNull()
      .references(() => jobProposals.id, { onDelete: "cascade" }),
    jobPostingId: uuid("job_posting_id")
      .notNull()
      .references(() => jobPostings.id, { onDelete: "cascade" }),
    platform: platformEnum("platform").notNull(),
    status: applicationStatusEnum("status").default("proposed").notNull(),
    submissionMode: varchar("submission_mode", { length: 32 }).notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    externalApplicationId: text("external_application_id"),
    submittedAt: timestamp("submitted_at", { withTimezone: true, mode: "date" }),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("applications_idempotency_unique").on(table.idempotencyKey),
    uniqueIndex("applications_tenant_owner_job_unique").on(
      table.tenantId,
      table.ownerId,
      table.jobPostingId,
    ),
    index("applications_tenant_status_idx").on(table.tenantId, table.status),
  ],
);

export const approvalRequests = pgTable(
  "approval_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    status: approvalStatusEnum("status").default("pending").notNull(),
    requestedBy: text("requested_by").notNull(),
    decidedBy: text("decided_by"),
    decisionReason: text("decision_reason"),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }),
    decidedAt: timestamp("decided_at", { withTimezone: true, mode: "date" }),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("approval_requests_tenant_status_idx").on(table.tenantId, table.status),
    uniqueIndex("approval_requests_one_pending_per_application_unique")
      .on(table.applicationId)
      .where(sql`${table.status} = 'pending'`),
  ],
);

export const applicationDrafts = pgTable(
  "application_drafts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    sourceCvDocumentId: uuid("source_cv_document_id").references(() => cvDocuments.id, {
      onDelete: "set null",
    }),
    coverLetter: text("cover_letter").notNull(),
    screeningAnswers: jsonb("screening_answers")
      .$type<ScreeningAnswerDraft[]>()
      .default([])
      .notNull(),
    sourceFacts: jsonb("source_facts").$type<ApplicationSourceFact[]>().default([]).notNull(),
    missingFacts: text("missing_facts").array().default(sql`ARRAY[]::text[]`).notNull(),
    groundingFingerprint: varchar("grounding_fingerprint", { length: 64 }).notNull(),
    generationMode: varchar("generation_mode", { length: 32 }).default("deterministic").notNull(),
    model: text("model"),
    inputTokens: integer("input_tokens").default(0).notNull(),
    outputTokens: integer("output_tokens").default(0).notNull(),
    revision: integer("revision").default(1).notNull(),
    lastEditedBy: text("last_edited_by"),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("application_drafts_application_unique").on(table.applicationId),
    index("application_drafts_tenant_owner_idx").on(table.tenantId, table.ownerId),
    check("application_drafts_revision_positive", sql`${table.revision} > 0`),
    check("application_drafts_token_counts", sql`${table.inputTokens} >= 0 AND ${table.outputTokens} >= 0`),
  ],
);

export const applicationSubmissionAttempts = pgTable(
  "application_submission_attempts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    platform: platformEnum("platform").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    requestHash: varchar("request_hash", { length: 64 }).notNull(),
    status: submissionAttemptStatusEnum("status").default("pending").notNull(),
    externalApplicationId: text("external_application_id"),
    safeReceipt: jsonb("safe_receipt").$type<Record<string, unknown>>(),
    failureCode: varchar("failure_code", { length: 128 }),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("application_submission_attempts_idempotency_unique").on(table.idempotencyKey),
    index("application_submission_attempts_application_idx").on(table.applicationId, table.createdAt),
    index("application_submission_attempts_tenant_owner_idx").on(table.tenantId, table.ownerId),
  ],
);

export const applicationEvents = pgTable(
  "application_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    fromStatus: applicationStatusEnum("from_status"),
    toStatus: applicationStatusEnum("to_status").notNull(),
    actorType: actorTypeEnum("actor_type").notNull(),
    actorId: text("actor_id").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    reason: text("reason"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt,
  },
  (table) => [
    uniqueIndex("application_events_idempotency_unique").on(table.idempotencyKey),
    index("application_events_application_created_idx").on(table.applicationId, table.createdAt),
  ],
);

export const agentSessions = pgTable(
  "agent_sessions",
  {
    sessionId: text("session_id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt,
    updatedAt,
  },
  (table) => [index("agent_sessions_tenant_owner_idx").on(table.tenantId, table.ownerId)],
);

export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    emailEnabled: boolean("email_enabled").default(false).notNull(),
    emailAddress: text("email_address"),
    createdAt,
    updatedAt,
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.ownerId], name: "notification_preferences_pk" }),
    check(
      "notification_preferences_email_destination",
      sql`${table.emailEnabled} = false OR ${table.emailAddress} IS NOT NULL`,
    ),
  ],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 64 }).notNull(),
    severity: notificationSeverityEnum("severity").default("info").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    actionHref: text("action_href"),
    dedupeKey: text("dedupe_key").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    readAt: timestamp("read_at", { withTimezone: true, mode: "date" }),
    createdAt,
  },
  (table) => [
    uniqueIndex("notifications_tenant_owner_dedupe_unique").on(
      table.tenantId,
      table.ownerId,
      table.dedupeKey,
    ),
    index("notifications_tenant_owner_created_idx").on(
      table.tenantId,
      table.ownerId,
      table.createdAt,
    ),
  ],
);

export const notificationDeliveries = pgTable(
  "notification_deliveries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    notificationId: uuid("notification_id")
      .notNull()
      .references(() => notifications.id, { onDelete: "cascade" }),
    channel: varchar("channel", { length: 32 }).notNull(),
    destination: text("destination").notNull(),
    status: notificationDeliveryStatusEnum("status").default("pending").notNull(),
    attemptCount: integer("attempt_count").default(0).notNull(),
    providerMessageId: text("provider_message_id"),
    failureCode: varchar("failure_code", { length: 128 }),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true, mode: "date" }),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("notification_deliveries_notification_channel_unique").on(
      table.notificationId,
      table.channel,
    ),
    index("notification_deliveries_pending_idx").on(table.status, table.nextAttemptAt),
    check("notification_deliveries_attempts_nonnegative", sql`${table.attemptCount} >= 0`),
  ],
);

export const supportGrants = pgTable(
  "support_grants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    grantedBy: uuid("granted_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    supportPrincipal: text("support_principal").notNull(),
    permissions: text("permissions").array().notNull(),
    reason: text("reason").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("support_grants_tenant_created_idx").on(table.tenantId, table.createdAt),
    index("support_grants_principal_expiry_idx").on(table.supportPrincipal, table.expiresAt),
    check("support_grants_nonempty_permissions", sql`cardinality(${table.permissions}) > 0`),
    check("support_grants_future_window", sql`${table.expiresAt} > ${table.createdAt}`),
  ],
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    actorType: actorTypeEnum("actor_type").notNull(),
    actorId: text("actor_id").notNull(),
    action: text("action").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id").notNull(),
    requestId: text("request_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt,
  },
  (table) => [index("audit_events_tenant_created_idx").on(table.tenantId, table.createdAt)],
);

// Privacy history deliberately survives deletion of an application user. The
// subject hash supports abuse prevention and audit correlation without keeping
// a Clerk identifier or email address after erasure.
export const privacyConsents = pgTable(
  "privacy_consents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "set null" }),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    subjectHash: varchar("subject_hash", { length: 64 }).notNull(),
    consentType: varchar("consent_type", { length: 64 }).notNull(),
    policyVersion: varchar("policy_version", { length: 32 }).notNull(),
    granted: boolean("granted").notNull(),
    source: varchar("source", { length: 32 }).default("settings").notNull(),
    requestId: text("request_id").notNull(),
    createdAt,
  },
  (table) => [
    uniqueIndex("privacy_consents_request_unique").on(table.requestId),
    index("privacy_consents_subject_created_idx").on(table.subjectHash, table.createdAt),
  ],
);

export const privacyRequests = pgTable(
  "privacy_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "set null" }),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    subjectHash: varchar("subject_hash", { length: 64 }).notNull(),
    type: privacyRequestTypeEnum("type").notNull(),
    status: privacyRequestStatusEnum("status").default("pending").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    confirmationTokenHash: varchar("confirmation_token_hash", { length: 64 }),
    confirmationExpiresAt: timestamp("confirmation_expires_at", {
      withTimezone: true,
      mode: "date",
    }),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
    failureCode: varchar("failure_code", { length: 128 }),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("privacy_requests_idempotency_unique").on(table.idempotencyKey),
    index("privacy_requests_subject_created_idx").on(table.subjectHash, table.createdAt),
  ],
);

export const tenantGovernancePolicies = pgTable(
  "tenant_governance_policies",
  {
    tenantId: uuid("tenant_id")
      .primaryKey()
      .references(() => tenants.id, { onDelete: "cascade" }),
    sourceSnapshotRetentionDays: integer("source_snapshot_retention_days").default(90).notNull(),
    notificationRetentionDays: integer("notification_retention_days").default(180).notNull(),
    auditRetentionDays: integer("audit_retention_days").default(365).notNull(),
    monthlySearchRunLimit: integer("monthly_search_run_limit").default(1_000).notNull(),
    monthlyEmailLimit: integer("monthly_email_limit").default(1_000).notNull(),
    budgetWarningPercent: integer("budget_warning_percent").default(80).notNull(),
    hardStopSearchRuns: boolean("hard_stop_search_runs").default(true).notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [
    check(
      "tenant_governance_snapshot_retention",
      sql`${table.sourceSnapshotRetentionDays} BETWEEN 30 AND 365`,
    ),
    check(
      "tenant_governance_notification_retention",
      sql`${table.notificationRetentionDays} BETWEEN 30 AND 730`,
    ),
    check(
      "tenant_governance_audit_retention",
      sql`${table.auditRetentionDays} BETWEEN 365 AND 2555`,
    ),
    check(
      "tenant_governance_search_budget",
      sql`${table.monthlySearchRunLimit} BETWEEN 1 AND 1000000`,
    ),
    check(
      "tenant_governance_email_budget",
      sql`${table.monthlyEmailLimit} BETWEEN 0 AND 1000000`,
    ),
    check(
      "tenant_governance_warning_percent",
      sql`${table.budgetWarningPercent} BETWEEN 50 AND 100`,
    ),
  ],
);
