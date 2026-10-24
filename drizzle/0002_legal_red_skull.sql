CREATE TYPE "public"."cv_processing_status" AS ENUM('pending', 'scanning', 'parsing', 'awaiting_confirmation', 'confirmed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."cv_scan_status" AS ENUM('pending', 'clean', 'infected', 'error', 'unavailable');--> statement-breakpoint
ALTER TABLE "candidate_profiles" ADD COLUMN "salary_min" integer;--> statement-breakpoint
ALTER TABLE "candidate_profiles" ADD COLUMN "salary_currency" varchar(3) DEFAULT 'PLN' NOT NULL;--> statement-breakpoint
ALTER TABLE "candidate_profiles" ADD COLUMN "salary_period" varchar(16) DEFAULT 'monthly' NOT NULL;--> statement-breakpoint
ALTER TABLE "candidate_profiles" ADD COLUMN "confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cv_documents" ADD COLUMN "processing_status" "cv_processing_status" DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "cv_documents" ADD COLUMN "scan_status" "cv_scan_status" DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "cv_documents" ADD COLUMN "workflow_run_id" text;--> statement-breakpoint
ALTER TABLE "cv_documents" ADD COLUMN "parsed_text" text;--> statement-breakpoint
ALTER TABLE "cv_documents" ADD COLUMN "extracted_profile" jsonb;--> statement-breakpoint
ALTER TABLE "cv_documents" ADD COLUMN "processing_error_code" varchar(128);--> statement-breakpoint
ALTER TABLE "cv_documents" ADD COLUMN "scanned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cv_documents" ADD COLUMN "parsed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cv_documents" ADD COLUMN "confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "search_schedules" ADD COLUMN "desired_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "cv_documents_workflow_run_unique" ON "cv_documents" USING btree ("workflow_run_id");