-- E-34 Contract: drop legacy columns.
--
-- PRE-CONDITIONS (verify before deploying):
--   1. Application code no longer reads/writes studio_name, city_slug, or is_verified.
--   2. All designer_profile rows have display_name and org_id populated.
--   3. The expand migration (0008) has been deployed and verified in production.
--
-- This is a separate migration so it can be deployed independently after
-- the expand is confirmed safe. If deployed prematurely, old code that still
-- reads these columns will break — hence the explicit pre-conditions.

ALTER TABLE "designer_profile" DROP COLUMN "studio_name";--> statement-breakpoint
ALTER TABLE "designer_profile" DROP COLUMN "city_slug";--> statement-breakpoint
ALTER TABLE "designer_profile" DROP COLUMN "is_verified";
