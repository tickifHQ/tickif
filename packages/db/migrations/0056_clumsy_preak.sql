ALTER TYPE "public"."organization_purge_manifest_item_status" ADD VALUE 'processing' BEFORE 'deleted';--> statement-breakpoint
ALTER TABLE "organization_purge_manifest_item" ADD COLUMN "claim_token" uuid;--> statement-breakpoint
ALTER TABLE "organization_purge_manifest_item" ADD COLUMN "claimed_at" timestamp with time zone;
