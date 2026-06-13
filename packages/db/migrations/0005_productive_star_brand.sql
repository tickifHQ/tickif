CREATE TYPE "public"."project_image_status" AS ENUM('processing', 'ready', 'failed');--> statement-breakpoint
ALTER TABLE "project_image" ADD COLUMN "room_id" uuid;--> statement-breakpoint
ALTER TABLE "project_image" ADD COLUMN "original_key" text NOT NULL;--> statement-breakpoint
ALTER TABLE "project_image" ADD COLUMN "derivatives" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "project_image" ADD COLUMN "phash" text;--> statement-breakpoint
ALTER TABLE "project_image" ADD COLUMN "status" "project_image_status" DEFAULT 'processing' NOT NULL;--> statement-breakpoint
ALTER TABLE "project_image" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "project_image" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE INDEX "project_image_project_idx" ON "project_image" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_image_project_phash_idx" ON "project_image" USING btree ("project_id","phash");--> statement-breakpoint
ALTER TABLE "project_image" DROP COLUMN "storage_key";--> statement-breakpoint
ALTER TABLE "project_image" DROP COLUMN "content_hash";--> statement-breakpoint
ALTER TABLE "project_image" DROP COLUMN "room_slug";--> statement-breakpoint
ALTER TABLE "project_image" DROP COLUMN "position";