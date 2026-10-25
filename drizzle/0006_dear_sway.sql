CREATE TYPE "public"."submission_attempt_status" AS ENUM('pending', 'submitted', 'failed', 'outcome_unknown');--> statement-breakpoint
CREATE TABLE "application_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"source_cv_document_id" uuid,
	"cover_letter" text NOT NULL,
	"screening_answers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source_facts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"missing_facts" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"grounding_fingerprint" varchar(64) NOT NULL,
	"generation_mode" varchar(32) DEFAULT 'deterministic' NOT NULL,
	"model" text,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"last_edited_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "application_drafts_revision_positive" CHECK ("application_drafts"."revision" > 0),
	CONSTRAINT "application_drafts_token_counts" CHECK ("application_drafts"."input_tokens" >= 0 AND "application_drafts"."output_tokens" >= 0)
);
--> statement-breakpoint
CREATE TABLE "application_submission_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"platform" "job_platform" NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_hash" varchar(64) NOT NULL,
	"status" "submission_attempt_status" DEFAULT 'pending' NOT NULL,
	"external_application_id" text,
	"safe_receipt" jsonb,
	"failure_code" varchar(128),
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "application_drafts" ADD CONSTRAINT "application_drafts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_drafts" ADD CONSTRAINT "application_drafts_owner_id_app_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."app_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_drafts" ADD CONSTRAINT "application_drafts_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_drafts" ADD CONSTRAINT "application_drafts_source_cv_document_id_cv_documents_id_fk" FOREIGN KEY ("source_cv_document_id") REFERENCES "public"."cv_documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_submission_attempts" ADD CONSTRAINT "application_submission_attempts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_submission_attempts" ADD CONSTRAINT "application_submission_attempts_owner_id_app_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."app_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_submission_attempts" ADD CONSTRAINT "application_submission_attempts_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "application_drafts_application_unique" ON "application_drafts" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "application_drafts_tenant_owner_idx" ON "application_drafts" USING btree ("tenant_id","owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "application_submission_attempts_idempotency_unique" ON "application_submission_attempts" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "application_submission_attempts_application_idx" ON "application_submission_attempts" USING btree ("application_id","created_at");--> statement-breakpoint
CREATE INDEX "application_submission_attempts_tenant_owner_idx" ON "application_submission_attempts" USING btree ("tenant_id","owner_id");--> statement-breakpoint
INSERT INTO "applications" (
	"tenant_id", "owner_id", "proposal_id", "job_posting_id", "platform",
	"status", "submission_mode", "idempotency_key"
)
SELECT
	proposal."tenant_id", proposal."owner_id", proposal."id", proposal."job_posting_id",
	posting."platform", 'approval_required'::application_status, 'manual',
	'application:' || proposal."tenant_id"::text || ':' || proposal."owner_id"::text || ':' || proposal."job_posting_id"::text
FROM "job_proposals" AS proposal
INNER JOIN "job_postings" AS posting ON posting."id" = proposal."job_posting_id"
WHERE proposal."status" IN ('proposed', 'approval_required')
ON CONFLICT DO NOTHING;--> statement-breakpoint
UPDATE "job_proposals" AS proposal
SET "status" = 'approval_required'::proposal_status, "updated_at" = now()
FROM "applications" AS application
WHERE application."proposal_id" = proposal."id"
	AND application."status" = 'approval_required'
	AND proposal."status" = 'proposed';--> statement-breakpoint
INSERT INTO "approval_requests" ("tenant_id", "application_id", "requested_by")
SELECT application."tenant_id", application."id", 'system:phase3-migration'
FROM "applications" AS application
WHERE application."status" = 'approval_required'
	AND NOT EXISTS (
		SELECT 1 FROM "approval_requests" AS approval
		WHERE approval."application_id" = application."id" AND approval."status" = 'pending'
	);--> statement-breakpoint
INSERT INTO "application_events" (
	"tenant_id", "application_id", "from_status", "to_status", "actor_type", "actor_id",
	"idempotency_key", "reason", "created_at"
)
SELECT application."tenant_id", application."id", NULL, 'proposed'::application_status,
	'system'::actor_type, 'phase3-migration', application."idempotency_key" || ':event:proposed',
	'A matching vacancy was proposed.', now()
FROM "applications" AS application
WHERE application."status" = 'approval_required'
ON CONFLICT ("idempotency_key") DO NOTHING;--> statement-breakpoint
INSERT INTO "application_events" (
	"tenant_id", "application_id", "from_status", "to_status", "actor_type", "actor_id",
	"idempotency_key", "reason", "created_at"
)
SELECT application."tenant_id", application."id", 'proposed'::application_status,
	'approval_required'::application_status, 'system'::actor_type, 'phase3-migration',
	application."idempotency_key" || ':event:approval-required',
	'Per-job approval is required before any application action.', now() + INTERVAL '1 millisecond'
FROM "applications" AS application
WHERE application."status" = 'approval_required'
ON CONFLICT ("idempotency_key") DO NOTHING;--> statement-breakpoint
INSERT INTO "application_drafts" (
	"tenant_id", "owner_id", "application_id", "source_cv_document_id", "cover_letter",
	"screening_answers", "source_facts", "missing_facts", "grounding_fingerprint", "generation_mode"
)
SELECT
	application."tenant_id", application."owner_id", application."id",
	active_cv."id",
	'Dear ' || posting."company" || ' hiring team,' || E'\n\n' ||
	'I am interested in the ' || posting."title" || ' opportunity at ' || posting."company" || '.' || E'\n\n' ||
	'I would welcome the opportunity to discuss the role. Please review my attached CV for the complete, confirmed details of my experience.' || E'\n\nKind regards,',
	'[]'::jsonb, '[]'::jsonb,
	ARRAY['This proposal predates Phase 3. Review the draft and add any screening questions manually.']::text[],
	md5(application."id"::text || ':' || COALESCE(active_cv."id"::text, 'none')) ||
	md5('phase3:' || application."id"::text || ':' || COALESCE(active_cv."id"::text, 'none')),
	'deterministic'
FROM "applications" AS application
INNER JOIN "job_postings" AS posting ON posting."id" = application."job_posting_id"
LEFT JOIN LATERAL (
	SELECT document."id"
	FROM "cv_documents" AS document
	WHERE document."tenant_id" = application."tenant_id"
		AND document."owner_id" = application."owner_id"
		AND document."status" = 'ready'
		AND document."processing_status" = 'confirmed'
		AND document."is_active" = true
	LIMIT 1
) AS active_cv ON true
ON CONFLICT ("application_id") DO NOTHING;--> statement-breakpoint
WITH ranked_pending AS (
	SELECT approval."id",
		row_number() OVER (
			PARTITION BY approval."application_id"
			ORDER BY approval."created_at" ASC, approval."id" ASC
		) AS pending_rank
	FROM "approval_requests" AS approval
	WHERE approval."status" = 'pending'
)
UPDATE "approval_requests" AS approval
SET "status" = 'cancelled'::approval_status,
	"decision_reason" = 'Superseded duplicate pending request during the Phase 3 migration.',
	"decided_at" = now(),
	"updated_at" = now()
FROM ranked_pending
WHERE approval."id" = ranked_pending."id"
	AND ranked_pending."pending_rank" > 1;--> statement-breakpoint
CREATE UNIQUE INDEX "approval_requests_one_pending_per_application_unique" ON "approval_requests" USING btree ("application_id") WHERE "approval_requests"."status" = 'pending';
