CREATE TABLE "designer_portfolio" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"public_link_enabled" boolean DEFAULT true NOT NULL,
	"portfolio_slug" text,
	"accent_color" text DEFAULT '#FF8F73' NOT NULL,
	"show_hero" boolean DEFAULT true NOT NULL,
	"show_trust_credentials" boolean DEFAULT true NOT NULL,
	"show_featured_testimonial" boolean DEFAULT true NOT NULL,
	"show_reviews" boolean DEFAULT true NOT NULL,
	"show_social_links" boolean DEFAULT true NOT NULL,
	"show_share_block" boolean DEFAULT true NOT NULL,
	"tagline" text,
	"testimonial_words" text,
	"testimonial_author" text,
	"testimonial_project_id" uuid,
	"testimonial_updated_at" timestamp,
	"show_overall_rating" boolean DEFAULT true NOT NULL,
	"show_positive_reviews_only" boolean DEFAULT false NOT NULL,
	"show_tickif_badge" boolean DEFAULT true NOT NULL,
	"published_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "designer_portfolio_profile_id_unique" UNIQUE("profile_id"),
	CONSTRAINT "designer_portfolio_portfolio_slug_unique" UNIQUE("portfolio_slug")
);
--> statement-breakpoint
ALTER TABLE "designer_portfolio" ADD CONSTRAINT "designer_portfolio_profile_id_designer_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."designer_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "designer_portfolio" ADD CONSTRAINT "designer_portfolio_testimonial_project_id_project_id_fk" FOREIGN KEY ("testimonial_project_id") REFERENCES "public"."project"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "designer_portfolio_profile_idx" ON "designer_portfolio" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "designer_portfolio_slug_idx" ON "designer_portfolio" USING btree ("portfolio_slug");