CREATE TYPE "public"."google_place_status" AS ENUM('pending', 'connected', 'error', 'stale');--> statement-breakpoint
CREATE TABLE "google_place_cache" (
	"profile_id" uuid PRIMARY KEY NOT NULL,
	"place_id" text NOT NULL,
	"rating" numeric(2, 1),
	"user_ratings_total" integer,
	"reviews" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "google_place_status" DEFAULT 'pending' NOT NULL,
	"last_fetched_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "google_place_cache" ADD CONSTRAINT "google_place_cache_profile_id_designer_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."designer_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "google_place_cache_status_fetched_idx" ON "google_place_cache" USING btree ("status","last_fetched_at");