CREATE TYPE "public"."privacy_request_status" AS ENUM('pending', 'processing', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."privacy_request_type" AS ENUM('export', 'erasure');--> statement-breakpoint
CREATE TABLE "privacy_consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"owner_id" uuid,
	"subject_hash" varchar(64) NOT NULL,
	"consent_type" varchar(64) NOT NULL,
	"policy_version" varchar(32) NOT NULL,
	"granted" boolean NOT NULL,
	"source" varchar(32) DEFAULT 'settings' NOT NULL,
	"request_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "privacy_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"owner_id" uuid,
	"subject_hash" varchar(64) NOT NULL,
	"type" "privacy_request_type" NOT NULL,
	"status" "privacy_request_status" DEFAULT 'pending' NOT NULL,
	"idempotency_key" text NOT NULL,
	"confirmation_token_hash" varchar(64),
	"confirmation_expires_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"failure_code" varchar(128),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_governance_policies" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"source_snapshot_retention_days" integer DEFAULT 90 NOT NULL,
	"notification_retention_days" integer DEFAULT 180 NOT NULL,
	"audit_retention_days" integer DEFAULT 365 NOT NULL,
	"monthly_search_run_limit" integer DEFAULT 1000 NOT NULL,
	"monthly_email_limit" integer DEFAULT 1000 NOT NULL,
	"budget_warning_percent" integer DEFAULT 80 NOT NULL,
	"hard_stop_search_runs" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_governance_snapshot_retention" CHECK ("tenant_governance_policies"."source_snapshot_retention_days" BETWEEN 30 AND 365),
	CONSTRAINT "tenant_governance_notification_retention" CHECK ("tenant_governance_policies"."notification_retention_days" BETWEEN 30 AND 730),
	CONSTRAINT "tenant_governance_audit_retention" CHECK ("tenant_governance_policies"."audit_retention_days" BETWEEN 365 AND 2555),
	CONSTRAINT "tenant_governance_search_budget" CHECK ("tenant_governance_policies"."monthly_search_run_limit" BETWEEN 1 AND 1000000),
	CONSTRAINT "tenant_governance_email_budget" CHECK ("tenant_governance_policies"."monthly_email_limit" BETWEEN 0 AND 1000000),
	CONSTRAINT "tenant_governance_warning_percent" CHECK ("tenant_governance_policies"."budget_warning_percent" BETWEEN 50 AND 100)
);
--> statement-breakpoint
ALTER TABLE "privacy_consents" ADD CONSTRAINT "privacy_consents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "privacy_consents" ADD CONSTRAINT "privacy_consents_owner_id_app_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."app_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "privacy_requests" ADD CONSTRAINT "privacy_requests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "privacy_requests" ADD CONSTRAINT "privacy_requests_owner_id_app_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."app_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_governance_policies" ADD CONSTRAINT "tenant_governance_policies_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "privacy_consents_request_unique" ON "privacy_consents" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "privacy_consents_subject_created_idx" ON "privacy_consents" USING btree ("subject_hash","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "privacy_requests_idempotency_unique" ON "privacy_requests" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "privacy_requests_subject_created_idx" ON "privacy_requests" USING btree ("subject_hash","created_at");