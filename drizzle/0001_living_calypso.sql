ALTER TABLE "search_schedules" ALTER COLUMN "enabled" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "search_runs" ADD COLUMN "scheduled_for" timestamp with time zone NOT NULL;--> statement-breakpoint
ALTER TABLE "search_runs" ADD COLUMN "schedule_lease_token" uuid;--> statement-breakpoint
ALTER TABLE "search_runs" ADD COLUMN "workflow_run_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "search_runs_workflow_run_unique" ON "search_runs" USING btree ("workflow_run_id");