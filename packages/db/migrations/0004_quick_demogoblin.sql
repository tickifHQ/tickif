CREATE TYPE "public"."entity_type" AS ENUM('individual', 'company');--> statement-breakpoint
ALTER TABLE "designer_profile" ADD COLUMN "entity_type" "entity_type" DEFAULT 'individual' NOT NULL;