CREATE TYPE "public"."project_moderation_reason" AS ENUM('project-details', 'image-quality', 'image-authenticity', 'room-tagging', 'project-ownership', 'budget-scope-clarity', 'duplicate-content', 'other');--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "rejection_reason_codes" "project_moderation_reason"[] DEFAULT '{}'::project_moderation_reason[] NOT NULL;--> statement-breakpoint
ALTER TABLE "project_moderation_event" ADD COLUMN "reason_codes" "project_moderation_reason"[] DEFAULT '{}'::project_moderation_reason[] NOT NULL;--> statement-breakpoint
-- Preserve the original free-text audit fields. The new reporting columns use
-- the closed vocabulary; unknown legacy reasons and note-only change requests
-- map to 'other'. Existing cover selections and public content are not changed.
UPDATE "project" SET "rejection_reason_codes" = ARRAY[
  CASE WHEN "rejection_reason_code" = ANY (ARRAY['project-details','image-quality','image-authenticity','room-tagging','project-ownership','budget-scope-clarity','duplicate-content','other'])
    THEN "rejection_reason_code" ELSE 'other' END::project_moderation_reason
] WHERE "rejection_reason_code" IS NOT NULL OR "status"::text IN ('changes_requested','rejected');--> statement-breakpoint
UPDATE "project_moderation_event" SET "reason_codes" = ARRAY[
  CASE WHEN "reason_code" = ANY (ARRAY['project-details','image-quality','image-authenticity','room-tagging','project-ownership','budget-scope-clarity','duplicate-content','other'])
    THEN "reason_code" ELSE 'other' END::project_moderation_reason
] WHERE "reason_code" IS NOT NULL OR "action"::text IN ('request_changes','reject');
