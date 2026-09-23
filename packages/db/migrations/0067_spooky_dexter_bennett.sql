ALTER TABLE "designer_portfolio" ADD COLUMN "experience_centers" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "city_name" text;