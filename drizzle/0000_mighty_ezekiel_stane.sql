CREATE TYPE "public"."actor_type" AS ENUM('user', 'agent', 'system', 'connector');--> statement-breakpoint
CREATE TYPE "public"."application_status" AS ENUM('discovered', 'proposed', 'approval_required', 'approved', 'manual_required', 'applying', 'submitted', 'acknowledged', 'interview', 'rejected', 'offer', 'withdrawn', 'failed', 'outcome_unknown', 'dismissed', 'expired');--> statement-breakpoint
CREATE TYPE "public"."approval_status" AS ENUM('pending', 'approved', 'rejected', 'expired', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."cv_status" AS ENUM('pending_upload', 'ready', 'quarantined', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."integration_status" AS ENUM('disconnected', 'pending', 'connected', 'degraded', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('owner', 'admin', 'member');--> statement-breakpoint
CREATE TYPE "public"."job_platform" AS ENUM('linkedin', 'just_join_it', 'no_fluff_jobs', 'dou', 'djinni');--> statement-breakpoint
CREATE TYPE "public"."proposal_status" AS ENUM('proposed', 'approval_required', 'approved', 'manual_required', 'dismissed', 'expired');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('queued', 'leased', 'running', 'completed', 'partially_completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."run_trigger" AS ENUM('manual', 'scheduled', 'catch_up');--> statement-breakpoint
CREATE TYPE "public"."schedule_cadence" AS ENUM('daily', 'weekly');--> statement-breakpoint
CREATE TABLE "agent_sessions" (
	"session_id" text PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "application_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"from_status" "application_status",
	"to_status" "application_status" NOT NULL,
	"actor_type" "actor_type" NOT NULL,
	"actor_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"reason" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"proposal_id" uuid NOT NULL,
	"job_posting_id" uuid NOT NULL,
	"platform" "job_platform" NOT NULL,
	"status" "application_status" DEFAULT 'proposed' NOT NULL,
	"submission_mode" varchar(32) NOT NULL,
	"idempotency_key" text NOT NULL,
	"external_application_id" text,
	"submitted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approval_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"status" "approval_status" DEFAULT 'pending' NOT NULL,
	"requested_by" text NOT NULL,
	"decided_by" text,
	"decision_reason" text,
	"expires_at" timestamp with time zone,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"actor_type" "actor_type" NOT NULL,
	"actor_id" text NOT NULL,
	"action" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text NOT NULL,
	"request_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "candidate_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"display_name" text,
	"headline" text,
	"target_countries" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"target_titles" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"work_modes" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"languages" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"excluded_companies" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"profile_facts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cv_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"status" "cv_status" DEFAULT 'pending_upload' NOT NULL,
	"object_key" text NOT NULL,
	"original_name" text NOT NULL,
	"content_type" varchar(128) NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" varchar(64),
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cv_documents_size_positive" CHECK ("cv_documents"."size_bytes" > 0)
);
--> statement-breakpoint
CREATE TABLE "job_postings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform" "job_platform" NOT NULL,
	"external_id" text NOT NULL,
	"canonical_url" text NOT NULL,
	"title" text NOT NULL,
	"company" text NOT NULL,
	"country_code" varchar(2) NOT NULL,
	"city" text,
	"remote" boolean DEFAULT false NOT NULL,
	"published_at" timestamp with time zone,
	"publication_date_verified" boolean DEFAULT false NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"content_hash" varchar(64) NOT NULL,
	"source_payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"job_posting_id" uuid NOT NULL,
	"status" "proposal_status" DEFAULT 'proposed' NOT NULL,
	"match_score" integer NOT NULL,
	"reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"concerns" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_proposals_score_range" CHECK ("job_proposals"."match_score" BETWEEN 0 AND 100)
);
--> statement-breakpoint
CREATE TABLE "platform_integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"platform" "job_platform" NOT NULL,
	"status" "integration_status" DEFAULT 'disconnected' NOT NULL,
	"auth_mode" varchar(64),
	"secret_reference" text,
	"external_account_reference" text,
	"capabilities" jsonb DEFAULT '{"discover":false,"prepare":false,"submit":false,"track":false}'::jsonb NOT NULL,
	"last_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schedule_platforms" (
	"schedule_id" uuid NOT NULL,
	"platform" "job_platform" NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"search_limit" integer DEFAULT 25 NOT NULL,
	"auto_apply_limit" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "schedule_platforms_pk" PRIMARY KEY("schedule_id","platform"),
	CONSTRAINT "schedule_platforms_search_limit" CHECK ("schedule_platforms"."search_limit" BETWEEN 1 AND 100),
	CONSTRAINT "schedule_platforms_auto_limit" CHECK ("schedule_platforms"."auto_apply_limit" BETWEEN 0 AND 25),
	CONSTRAINT "schedule_platforms_limit_order" CHECK ("schedule_platforms"."auto_apply_limit" <= "schedule_platforms"."search_limit")
);
--> statement-breakpoint
CREATE TABLE "search_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"schedule_id" uuid,
	"trigger" "run_trigger" NOT NULL,
	"status" "run_status" DEFAULT 'queued' NOT NULL,
	"idempotency_key" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"window_end" timestamp with time zone NOT NULL,
	"counters" jsonb DEFAULT '{"found":0,"new":0,"duplicate":0,"eligible":0,"proposed":0,"failed":0}'::jsonb NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"failure_code" varchar(128),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "search_runs_valid_window" CHECK ("search_runs"."window_start" < "search_runs"."window_end")
);
--> statement-breakpoint
CREATE TABLE "search_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"cadence" "schedule_cadence" NOT NULL,
	"timezone" varchar(128) NOT NULL,
	"local_time" varchar(5) NOT NULL,
	"day_of_week" integer,
	"target_countries" text[] NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"max_age_days" integer DEFAULT 7 NOT NULL,
	"next_run_at" timestamp with time zone NOT NULL,
	"last_successful_window_end" timestamp with time zone,
	"lease_token" uuid,
	"lease_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "search_schedules_max_age" CHECK ("search_schedules"."max_age_days" BETWEEN 1 AND 7),
	CONSTRAINT "search_schedules_weekday" CHECK ("search_schedules"."day_of_week" IS NULL OR "search_schedules"."day_of_week" BETWEEN 0 AND 6)
);
--> statement-breakpoint
CREATE TABLE "tenant_members" (
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "member_role" DEFAULT 'member' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_members_pk" PRIMARY KEY("tenant_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"external_key" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_owner_id_app_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."app_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_events" ADD CONSTRAINT "application_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_events" ADD CONSTRAINT "application_events_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_owner_id_app_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."app_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_proposal_id_job_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."job_proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_job_posting_id_job_postings_id_fk" FOREIGN KEY ("job_posting_id") REFERENCES "public"."job_postings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_profiles" ADD CONSTRAINT "candidate_profiles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_profiles" ADD CONSTRAINT "candidate_profiles_owner_id_app_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."app_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cv_documents" ADD CONSTRAINT "cv_documents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cv_documents" ADD CONSTRAINT "cv_documents_owner_id_app_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."app_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_proposals" ADD CONSTRAINT "job_proposals_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_proposals" ADD CONSTRAINT "job_proposals_owner_id_app_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."app_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_proposals" ADD CONSTRAINT "job_proposals_run_id_search_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."search_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_proposals" ADD CONSTRAINT "job_proposals_job_posting_id_job_postings_id_fk" FOREIGN KEY ("job_posting_id") REFERENCES "public"."job_postings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_integrations" ADD CONSTRAINT "platform_integrations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_integrations" ADD CONSTRAINT "platform_integrations_owner_id_app_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."app_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_platforms" ADD CONSTRAINT "schedule_platforms_schedule_id_search_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."search_schedules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_runs" ADD CONSTRAINT "search_runs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_runs" ADD CONSTRAINT "search_runs_owner_id_app_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."app_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_runs" ADD CONSTRAINT "search_runs_schedule_id_search_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."search_schedules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_schedules" ADD CONSTRAINT "search_schedules_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_schedules" ADD CONSTRAINT "search_schedules_owner_id_app_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."app_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_members" ADD CONSTRAINT "tenant_members_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_members" ADD CONSTRAINT "tenant_members_user_id_app_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_sessions_tenant_owner_idx" ON "agent_sessions" USING btree ("tenant_id","owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "application_events_idempotency_unique" ON "application_events" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "application_events_application_created_idx" ON "application_events" USING btree ("application_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "applications_idempotency_unique" ON "applications" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "applications_tenant_owner_job_unique" ON "applications" USING btree ("tenant_id","owner_id","job_posting_id");--> statement-breakpoint
CREATE INDEX "applications_tenant_status_idx" ON "applications" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "approval_requests_tenant_status_idx" ON "approval_requests" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "audit_events_tenant_created_idx" ON "audit_events" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "candidate_profiles_tenant_owner_unique" ON "candidate_profiles" USING btree ("tenant_id","owner_id");--> statement-breakpoint
CREATE INDEX "candidate_profiles_tenant_idx" ON "candidate_profiles" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cv_documents_object_key_unique" ON "cv_documents" USING btree ("object_key");--> statement-breakpoint
CREATE INDEX "cv_documents_tenant_owner_idx" ON "cv_documents" USING btree ("tenant_id","owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "job_postings_platform_external_unique" ON "job_postings" USING btree ("platform","external_id");--> statement-breakpoint
CREATE INDEX "job_postings_published_idx" ON "job_postings" USING btree ("published_at");--> statement-breakpoint
CREATE UNIQUE INDEX "job_proposals_tenant_owner_job_unique" ON "job_proposals" USING btree ("tenant_id","owner_id","job_posting_id");--> statement-breakpoint
CREATE INDEX "job_proposals_tenant_status_idx" ON "job_proposals" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_integrations_owner_platform_unique" ON "platform_integrations" USING btree ("tenant_id","owner_id","platform");--> statement-breakpoint
CREATE UNIQUE INDEX "search_runs_idempotency_unique" ON "search_runs" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "search_runs_tenant_created_idx" ON "search_runs" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "search_schedules_due_idx" ON "search_schedules" USING btree ("enabled","next_run_at");--> statement-breakpoint
CREATE INDEX "search_schedules_tenant_owner_idx" ON "search_schedules" USING btree ("tenant_id","owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "search_schedules_idempotency_unique" ON "search_schedules" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "tenant_members_user_idx" ON "tenant_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tenants_external_key_unique" ON "tenants" USING btree ("external_key");--> statement-breakpoint
CREATE UNIQUE INDEX "app_users_clerk_user_id_unique" ON "app_users" USING btree ("clerk_user_id");