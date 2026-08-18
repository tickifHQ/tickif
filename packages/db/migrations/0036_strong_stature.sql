-- `gin_trgm_ops` comes from pg_trgm; drizzle's schema DSL cannot express an extension,
-- so this statement is prepended to the generated file by hand. Everything below it is
-- drizzle-generated — see docs/database-and-migrations.md (0036).
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE INDEX "designer_profile_display_name_trgm_idx" ON "designer_profile" USING gin ("display_name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "project_title_trgm_idx" ON "project" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "project_description_trgm_idx" ON "project" USING gin ("description" gin_trgm_ops);