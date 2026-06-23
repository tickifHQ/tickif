ALTER TYPE "public"."taxonomy_kind" ADD VALUE 'property_subtype' BEFORE 'bhk';--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "property_subtype_slug" text;--> statement-breakpoint
CREATE INDEX "project_property_subtype_idx" ON "project" USING btree ("property_subtype_slug");