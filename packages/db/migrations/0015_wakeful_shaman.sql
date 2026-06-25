ALTER TABLE "project" ADD COLUMN "property_type_slug" text;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "scope_slug" text;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "bhk_slug" text;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "size_sqft" integer;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "locality_slug" text;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "building_name" text;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "completed_month" text;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "duration_months" integer;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "submitted_at" timestamp;--> statement-breakpoint
ALTER TABLE "project_image" ADD COLUMN "theme_slugs" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "project_image" ADD COLUMN "material_slugs" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "project_image" ADD COLUMN "finish_slugs" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "project_image" ADD COLUMN "tag_slugs" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
CREATE INDEX "project_locality_idx" ON "project" USING btree ("locality_slug");--> statement-breakpoint
CREATE INDEX "project_property_type_idx" ON "project" USING btree ("property_type_slug");--> statement-breakpoint
CREATE INDEX "project_scope_idx" ON "project" USING btree ("scope_slug");