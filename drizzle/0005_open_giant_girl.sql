ALTER TYPE "public"."cv_status" ADD VALUE 'deleting' BEFORE 'deleted';--> statement-breakpoint
ALTER TABLE "cv_documents" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "cv_documents_one_active_per_owner_unique" ON "cv_documents" USING btree ("tenant_id","owner_id") WHERE "cv_documents"."is_active" = true;