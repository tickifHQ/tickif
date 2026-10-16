ALTER TABLE "designer_portfolio" ADD COLUMN IF NOT EXISTS "show_about_company" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "designer_portfolio" ADD COLUMN IF NOT EXISTS "about_company" jsonb;--> statement-breakpoint
ALTER TABLE "designer_portfolio" ADD COLUMN IF NOT EXISTS "founder_image_id" text;--> statement-breakpoint
ALTER TABLE "designer_portfolio" ADD COLUMN IF NOT EXISTS "studio_image_id" text;