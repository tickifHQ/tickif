-- E-34 Expand: DesignerProfile model + footprint join table
-- Deploy-safe: add nullable → backfill → SET NOT NULL. No column drops (deferred to 0009).
-- Follows the 0004 pattern (backfill before constraints).
--
-- PRE-FLIGHT CHECK (run before deploying to a populated environment):
--   SELECT sub.org_id, count(*) FROM (
--     SELECT (SELECT m.organization_id FROM member m
--             WHERE m.user_id = dp.user_id ORDER BY m.created_at ASC LIMIT 1) as org_id
--     FROM designer_profile dp WHERE dp.user_id IS NOT NULL
--   ) sub GROUP BY sub.org_id HAVING count(*) > 1;
-- If that returns rows, deduplicate profiles manually before running this migration.

-- 1. New enums
CREATE TYPE "public"."entity_type" AS ENUM('individual', 'company');--> statement-breakpoint
CREATE TYPE "public"."profile_status" AS ENUM('draft', 'active', 'suspended');--> statement-breakpoint

-- 2. Footprint join table
CREATE TABLE "designer_profile_footprint" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"taxonomy_id" uuid NOT NULL
);
--> statement-breakpoint

-- 3. Relax user_id: ownership moves to org_id
ALTER TABLE "designer_profile" DROP CONSTRAINT "designer_profile_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "designer_profile" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint

-- 4. Add new columns — nullable or defaulted (deploy-safe on populated tables)
ALTER TABLE "designer_profile" ADD COLUMN "org_id" text;--> statement-breakpoint
ALTER TABLE "designer_profile" ADD COLUMN "entity_type" "entity_type" DEFAULT 'individual' NOT NULL;--> statement-breakpoint
ALTER TABLE "designer_profile" ADD COLUMN "display_name" text;--> statement-breakpoint
ALTER TABLE "designer_profile" ADD COLUMN "logo_image_id" text;--> statement-breakpoint
ALTER TABLE "designer_profile" ADD COLUMN "status" "profile_status" DEFAULT 'draft' NOT NULL;--> statement-breakpoint
ALTER TABLE "designer_profile" ADD COLUMN "years_experience" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "designer_profile" ADD COLUMN "project_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "designer_profile" ADD COLUMN "share_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "designer_profile" ADD COLUMN "avg_rating" numeric(3, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "designer_profile" ADD COLUMN "review_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "designer_profile" ADD COLUMN "website_url" text;--> statement-breakpoint
ALTER TABLE "designer_profile" ADD COLUMN "testimonial_banner_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "designer_profile" ADD COLUMN "staff_count" integer;--> statement-breakpoint

-- 5. Backfill display_name from studio_name (safe: studio_name is NOT NULL)
UPDATE "designer_profile" SET "display_name" = "studio_name" WHERE "display_name" IS NULL;--> statement-breakpoint

-- 6. Backfill org_id — deterministic (earliest membership by created_at)
UPDATE "designer_profile" dp SET "org_id" = (
  SELECT m."organization_id" FROM "member" m
  WHERE m."user_id" = dp."user_id"
  ORDER BY m."created_at" ASC LIMIT 1
) WHERE dp."org_id" IS NULL AND dp."user_id" IS NOT NULL;--> statement-breakpoint

-- 7. Enforce NOT NULL (only after backfill guarantees no NULLs)
ALTER TABLE "designer_profile" ALTER COLUMN "display_name" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "designer_profile" ALTER COLUMN "org_id" SET NOT NULL;--> statement-breakpoint

-- 8. FKs and constraints
ALTER TABLE "designer_profile_footprint" ADD CONSTRAINT "designer_profile_footprint_profile_id_designer_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."designer_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "designer_profile_footprint" ADD CONSTRAINT "designer_profile_footprint_taxonomy_id_taxonomy_id_fk" FOREIGN KEY ("taxonomy_id") REFERENCES "public"."taxonomy"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "designer_profile" ADD CONSTRAINT "designer_profile_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "designer_profile" ADD CONSTRAINT "designer_profile_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "designer_profile" ADD CONSTRAINT "designer_profile_org_id_unique" UNIQUE("org_id");--> statement-breakpoint

-- 9. Indexes
CREATE INDEX "dpf_profile_idx" ON "designer_profile_footprint" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "dpf_taxonomy_idx" ON "designer_profile_footprint" USING btree ("taxonomy_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dpf_profile_taxonomy_uniq" ON "designer_profile_footprint" USING btree ("profile_id","taxonomy_id");--> statement-breakpoint
CREATE INDEX "designer_profile_org_idx" ON "designer_profile" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "designer_profile_status_idx" ON "designer_profile" USING btree ("status");
