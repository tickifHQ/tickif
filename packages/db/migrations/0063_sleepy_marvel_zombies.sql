ALTER TABLE "project" ADD COLUMN "approved_image_ids" jsonb;
--> statement-breakpoint
UPDATE "project" SET "approved_image_ids" = (
  SELECT coalesce(jsonb_agg("project_image"."id" ORDER BY "project_image"."id"), '[]'::jsonb)
  FROM "project_image" WHERE "project_image"."project_id" = "project"."id" AND "project_image"."is_live" = true AND "project_image"."status" = 'ready'
) WHERE "status" = 'published';
