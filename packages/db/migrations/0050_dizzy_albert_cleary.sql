CREATE TYPE "public"."project_archive_reason" AS ENUM('manual', 'organization_retention');--> statement-breakpoint
ALTER TYPE "public"."moderation_action" ADD VALUE 'archive';--> statement-breakpoint
ALTER TYPE "public"."moderation_action" ADD VALUE 'restore';--> statement-breakpoint
ALTER TYPE "public"."moderation_action" ADD VALUE 'delete';--> statement-breakpoint
ALTER TYPE "public"."project_status" ADD VALUE 'archived';--> statement-breakpoint
ALTER TYPE "public"."project_status" ADD VALUE 'delisted';--> statement-breakpoint
ALTER TYPE "public"."project_status" ADD VALUE 'deleted';--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "archive_reason" "project_archive_reason";