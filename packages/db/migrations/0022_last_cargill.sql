ALTER TABLE "project_image" ADD COLUMN "duplicate_of_image_id" uuid;--> statement-breakpoint
ALTER TABLE "project_image" ADD COLUMN "duplicate_distance" integer;--> statement-breakpoint
CREATE INDEX "project_submitted_moderation_queue_idx" ON "project" USING btree ("submitted_at","id") WHERE "project"."status" = 'submitted';--> statement-breakpoint
CREATE INDEX "project_in_review_moderation_queue_idx" ON "project" USING btree ("reviewed_by","submitted_at","id") WHERE "project"."status" = 'in_review';--> statement-breakpoint
ALTER TABLE "project_image" ADD CONSTRAINT "project_image_duplicate_distance_nonnegative" CHECK ("project_image"."duplicate_distance" is null or "project_image"."duplicate_distance" >= 0);