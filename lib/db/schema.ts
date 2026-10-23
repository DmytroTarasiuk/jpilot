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
  "deleted",
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
export const actorTypeEnum = pgEnum("actor_type", ["user", "agent", "system", "connector"]);

export type PlatformKey = (typeof platformEnum.enumValues)[number];
export type ApplicationStatus = (typeof applicationStatusEnum.enumValues)[number];

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
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("cv_documents_object_key_unique").on(table.objectKey),
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
  (table) => [index("approval_requests_tenant_status_idx").on(table.tenantId, table.status)],
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
