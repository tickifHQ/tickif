-- DESTRUCTIVE / one-way migration. Expand/contract: add nullable original_key, backfill from
-- storage_key, then enforce NOT NULL, so this never aborts on a populated project_image.
-- WARNING: there is NO clean rollback. room_slug is dropped with no replacement to copy into, so its
-- data is unrecoverable; original_key/phash/sort_order restore only if the forward backfill ran. Take
-- a logical backup of project_image before a populated-table apply; recover by forward-fix, not rollback.
-- Indexes are built non-concurrently because drizzle runs each migration in a transaction; for a
-- large/persistent table, build the indexes CONCURRENTLY out-of-band instead. See docs/runbooks/media-pipeline.md.
CREATE TYPE "public"."project_image_status" AS ENUM('processing', 'ready', 'failed');--> statement-breakpoint
ALTER TABLE "project_image" ADD COLUMN "room_id" uuid;--> statement-breakpoint
ALTER TABLE "project_image" ADD COLUMN "original_key" text;--> statement-breakpoint
ALTER TABLE "project_image" ADD COLUMN "derivatives" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "project_image" ADD COLUMN "phash" text;--> statement-breakpoint
ALTER TABLE "project_image" ADD COLUMN "status" "project_image_status" DEFAULT 'processing' NOT NULL;--> statement-breakpoint
ALTER TABLE "project_image" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "project_image" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
UPDATE "project_image" SET "original_key" = "storage_key", "phash" = "content_hash", "sort_order" = "position" WHERE "original_key" IS NULL;--> statement-breakpoint
ALTER TABLE "project_image" ALTER COLUMN "original_key" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "project_image_project_idx" ON "project_image" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_image_project_phash_idx" ON "project_image" USING btree ("project_id","phash");--> statement-breakpoint
ALTER TABLE "project_image" DROP COLUMN "storage_key";--> statement-breakpoint
ALTER TABLE "project_image" DROP COLUMN "content_hash";--> statement-breakpoint
ALTER TABLE "project_image" DROP COLUMN "room_slug";--> statement-breakpoint
ALTER TABLE "project_image" DROP COLUMN "position";