CREATE TYPE "public"."organization_purge_manifest_item_kind" AS ENUM('storage_object');--> statement-breakpoint
CREATE TYPE "public"."organization_purge_manifest_item_status" AS ENUM('pending', 'deleted', 'failed');--> statement-breakpoint
CREATE TYPE "public"."organization_purge_manifest_status" AS ENUM('pending', 'processing', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."organization_retention_event_type" AS ENUM('deletion_requested', 'deletion_cancelled', 'archived', 'restored', 'hold_placed', 'hold_released', 'purge_requested', 'purge_started', 'purge_completed', 'purge_failed');--> statement-breakpoint
CREATE TYPE "public"."organization_retention_status" AS ENUM('deletion_requested', 'archived', 'purge_pending', 'purging', 'erased');--> statement-breakpoint
CREATE TYPE "public"."organization_retention_trigger" AS ENUM('owner', 'superadmin', 'retention_schedule');--> statement-breakpoint
ALTER TYPE "public"."moderation_action" ADD VALUE 'organization_delist';--> statement-breakpoint
ALTER TYPE "public"."moderation_action" ADD VALUE 'organization_archive';--> statement-breakpoint
ALTER TYPE "public"."moderation_action" ADD VALUE 'organization_restore';--> statement-breakpoint
CREATE TABLE "organization_purge_manifest" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"organization_slug" text NOT NULL,
	"status" "organization_purge_manifest_status" DEFAULT 'pending' NOT NULL,
	"trigger" "organization_retention_trigger" NOT NULL,
	"requested_by_user_id" text,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_purge_manifest_attempt_count_check" CHECK ("organization_purge_manifest"."attempt_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "organization_purge_manifest_item" (
	"sequence" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "organization_purge_manifest_item_sequence_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"manifest_id" uuid NOT NULL,
	"kind" "organization_purge_manifest_item_kind" NOT NULL,
	"resource_key" text NOT NULL,
	"status" "organization_purge_manifest_item_status" DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_error_code" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_purge_manifest_item_attempt_count_check" CHECK ("organization_purge_manifest_item"."attempt_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "organization_retention" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"status" "organization_retention_status" NOT NULL,
	"requested_by_user_id" text NOT NULL,
	"requested_at" timestamp with time zone NOT NULL,
	"archive_due_at" timestamp with time zone NOT NULL,
	"hard_delete_due_at" timestamp with time zone NOT NULL,
	"delist_window_days" integer NOT NULL,
	"archive_window_days" integer NOT NULL,
	"archived_at" timestamp with time zone,
	"purge_requested_at" timestamp with time zone,
	"purging_at" timestamp with time zone,
	"erased_at" timestamp with time zone,
	"hold_placed_at" timestamp with time zone,
	"hold_placed_by_user_id" text,
	"hold_reason" text,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_retention_due_order_check" CHECK ("organization_retention"."requested_at" <= "organization_retention"."archive_due_at" and "organization_retention"."archive_due_at" <= "organization_retention"."hard_delete_due_at"),
	CONSTRAINT "organization_retention_revision_check" CHECK ("organization_retention"."revision" > 0),
	CONSTRAINT "organization_retention_policy_windows_check" CHECK ("organization_retention"."delist_window_days" > 0 and "organization_retention"."archive_window_days" > 0),
	CONSTRAINT "organization_retention_hold_check" CHECK (("organization_retention"."hold_placed_at" is null and "organization_retention"."hold_placed_by_user_id" is null and "organization_retention"."hold_reason" is null) or ("organization_retention"."hold_placed_at" is not null and "organization_retention"."hold_placed_by_user_id" is not null and "organization_retention"."hold_reason" is not null and char_length(trim("organization_retention"."hold_reason")) > 0))
);
--> statement-breakpoint
CREATE TABLE "organization_retention_event" (
	"sequence" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "organization_retention_event_sequence_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"organization_id" text NOT NULL,
	"revision" integer NOT NULL,
	"type" "organization_retention_event_type" NOT NULL,
	"trigger" "organization_retention_trigger" NOT NULL,
	"actor_user_id" text,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_retention_event_revision_check" CHECK ("organization_retention_event"."revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "organization_retention_profile_snapshot" (
	"organization_id" text NOT NULL,
	"profile_id" uuid NOT NULL,
	"original_status" "profile_status" NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_retention_profile_snapshot_pk" PRIMARY KEY("organization_id","profile_id")
);
--> statement-breakpoint
CREATE TABLE "organization_retention_project_snapshot" (
	"organization_id" text NOT NULL,
	"project_id" uuid NOT NULL,
	"original_status" "project_status" NOT NULL,
	"original_archive_reason" "project_archive_reason",
	"original_published_at" timestamp,
	"original_featured_at" timestamp,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_retention_project_snapshot_pk" PRIMARY KEY("organization_id","project_id")
);
--> statement-breakpoint
CREATE TABLE "project_tombstone" (
	"project_id" uuid PRIMARY KEY NOT NULL,
	"project_slug" text NOT NULL,
	"organization_id" text NOT NULL,
	"purged_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organization_purge_manifest_item" ADD CONSTRAINT "organization_purge_manifest_item_manifest_id_organization_purge_manifest_id_fk" FOREIGN KEY ("manifest_id") REFERENCES "public"."organization_purge_manifest"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_retention" ADD CONSTRAINT "organization_retention_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_retention_profile_snapshot" ADD CONSTRAINT "organization_retention_profile_snapshot_organization_id_organization_retention_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization_retention"("organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_retention_project_snapshot" ADD CONSTRAINT "organization_retention_project_snapshot_organization_id_organization_retention_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization_retention"("organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "organization_purge_manifest_org_uniq" ON "organization_purge_manifest" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "organization_purge_manifest_status_created_idx" ON "organization_purge_manifest" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_purge_manifest_item_resource_uniq" ON "organization_purge_manifest_item" USING btree ("manifest_id","kind","resource_key");--> statement-breakpoint
CREATE INDEX "organization_purge_manifest_item_status_sequence_idx" ON "organization_purge_manifest_item" USING btree ("status","sequence");--> statement-breakpoint
CREATE INDEX "organization_purge_manifest_item_manifest_idx" ON "organization_purge_manifest_item" USING btree ("manifest_id");--> statement-breakpoint
CREATE INDEX "organization_retention_archive_due_idx" ON "organization_retention" USING btree ("archive_due_at") WHERE "organization_retention"."status" = 'deletion_requested' and "organization_retention"."hold_placed_at" is null;--> statement-breakpoint
CREATE INDEX "organization_retention_hard_delete_due_idx" ON "organization_retention" USING btree ("hard_delete_due_at") WHERE "organization_retention"."status" = 'archived' and "organization_retention"."hold_placed_at" is null;--> statement-breakpoint
CREATE INDEX "organization_retention_event_org_revision_idx" ON "organization_retention_event" USING btree ("organization_id","revision");--> statement-breakpoint
CREATE INDEX "organization_retention_event_org_occurred_idx" ON "organization_retention_event" USING btree ("organization_id","occurred_at");--> statement-breakpoint
CREATE INDEX "organization_retention_profile_snapshot_profile_idx" ON "organization_retention_profile_snapshot" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "organization_retention_project_snapshot_project_idx" ON "organization_retention_project_snapshot" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_tombstone_slug_uniq" ON "project_tombstone" USING btree ("project_slug");--> statement-breakpoint
CREATE INDEX "project_tombstone_organization_idx" ON "project_tombstone" USING btree ("organization_id");