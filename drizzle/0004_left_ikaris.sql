CREATE TABLE "job_source_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"platform" "job_platform" NOT NULL,
	"external_id" text NOT NULL,
	"job_posting_id" uuid,
	"source_url" text NOT NULL,
	"content_hash" varchar(64) NOT NULL,
	"source_payload" jsonb NOT NULL,
	"normalized_payload" jsonb,
	"is_new" boolean,
	"eligible" boolean,
	"proposed" boolean,
	"match_score" integer,
	"reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"concerns" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"hard_filter_failures" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"failure_code" varchar(128),
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_source_snapshots_score_range" CHECK ("job_source_snapshots"."match_score" IS NULL OR "job_source_snapshots"."match_score" BETWEEN 0 AND 100)
);
--> statement-breakpoint
ALTER TABLE "job_postings" ADD COLUMN "first_seen_run_id" uuid;--> statement-breakpoint
ALTER TABLE "job_source_snapshots" ADD CONSTRAINT "job_source_snapshots_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_source_snapshots" ADD CONSTRAINT "job_source_snapshots_owner_id_app_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."app_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_source_snapshots" ADD CONSTRAINT "job_source_snapshots_run_id_search_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."search_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_source_snapshots" ADD CONSTRAINT "job_source_snapshots_job_posting_id_job_postings_id_fk" FOREIGN KEY ("job_posting_id") REFERENCES "public"."job_postings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "job_source_snapshots_run_platform_external_unique" ON "job_source_snapshots" USING btree ("run_id","platform","external_id");--> statement-breakpoint
CREATE INDEX "job_source_snapshots_tenant_owner_run_idx" ON "job_source_snapshots" USING btree ("tenant_id","owner_id","run_id");--> statement-breakpoint
CREATE INDEX "job_source_snapshots_job_idx" ON "job_source_snapshots" USING btree ("job_posting_id");--> statement-breakpoint
ALTER TABLE "job_postings" ADD CONSTRAINT "job_postings_first_seen_run_id_search_runs_id_fk" FOREIGN KEY ("first_seen_run_id") REFERENCES "public"."search_runs"("id") ON DELETE set null ON UPDATE no action;