-- E-29: Taxonomy model — 8-kind enum, hierarchy, constraints, indexes.
--
-- Uses enum recreation (not ADD VALUE) because Drizzle's programmatic migrate()
-- wraps all migrations in a single transaction, and PostgreSQL's ADD VALUE
-- requires a committed transaction before the new values can be used.
--
-- Known limitation (intentional):
--   DB enforces: locality requires a parent; non-locality must not have a parent.
--   DB does NOT enforce: parent.kind = 'city'.
--   That validation will be implemented in E-30 service/admin CRUD.

-- 1. Recreate enum with all 8 values.
-- Safe: the new enum is a strict superset of the old {city,room,scope,theme,budget_band},
-- so the kind::text::taxonomy_kind cast preserves every existing row regardless of table
-- contents. Precondition: taxonomy.kind is the sole column using this enum type.
ALTER TABLE "taxonomy" ALTER COLUMN "kind" TYPE text;--> statement-breakpoint
DROP TYPE "public"."taxonomy_kind";--> statement-breakpoint
CREATE TYPE "public"."taxonomy_kind" AS ENUM('city','locality','property_type','bhk','room','scope','theme','budget_band');--> statement-breakpoint
ALTER TABLE "taxonomy" ALTER COLUMN "kind" TYPE "public"."taxonomy_kind" USING "kind"::"public"."taxonomy_kind";--> statement-breakpoint

-- 2. Drop old FK and index
ALTER TABLE "designer_profile_footprint" DROP CONSTRAINT "designer_profile_footprint_taxonomy_id_taxonomy_id_fk";
--> statement-breakpoint
DROP INDEX "taxonomy_kind_slug_idx";--> statement-breakpoint

-- 3. Add new columns
ALTER TABLE "taxonomy" ADD COLUMN "parent_id" uuid;--> statement-breakpoint
ALTER TABLE "taxonomy" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "taxonomy" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "taxonomy" ADD COLUMN "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "taxonomy" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint

-- 4. FKs
ALTER TABLE "designer_profile_footprint" ADD CONSTRAINT "designer_profile_footprint_taxonomy_id_taxonomy_id_fk" FOREIGN KEY ("taxonomy_id") REFERENCES "public"."taxonomy"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taxonomy" ADD CONSTRAINT "taxonomy_parent_id_taxonomy_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."taxonomy"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

-- 5. Indexes
CREATE UNIQUE INDEX "taxonomy_kind_slug_uniq" ON "taxonomy" USING btree ("kind","slug") WHERE "taxonomy"."parent_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "taxonomy_parent_slug_uniq" ON "taxonomy" USING btree ("parent_id","slug") WHERE "taxonomy"."parent_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "taxonomy_kind_active_idx" ON "taxonomy" USING btree ("kind","is_active");--> statement-breakpoint
CREATE INDEX "taxonomy_parent_idx" ON "taxonomy" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "taxonomy_kind_sort_idx" ON "taxonomy" USING btree ("kind","sort_order");--> statement-breakpoint

-- 6. CHECK constraints
ALTER TABLE "taxonomy" ADD CONSTRAINT "taxonomy_hierarchy_check" CHECK (
  (kind = 'locality' AND parent_id IS NOT NULL) OR
  (kind <> 'locality' AND parent_id IS NULL)
);--> statement-breakpoint
ALTER TABLE "taxonomy" ADD CONSTRAINT "taxonomy_slug_format_check" CHECK (
  slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
);
