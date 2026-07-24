CREATE TYPE "public"."moderation_action" AS ENUM('submit', 'resubmit', 'withdraw', 'start_review', 'publish', 'request_changes', 'reject', 'unpublish', 'metadata_corrected');--> statement-breakpoint
CREATE TABLE "project_moderation_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"actor_user_id" text,
	"action" "moderation_action" NOT NULL,
	"from_status" "project_status" NOT NULL,
	"to_status" "project_status" NOT NULL,
	"note" text,
	"reason_code" text,
	"field_diff" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "reviewed_by" text;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "review_started_at" timestamp;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "rejection_reason_code" text;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "moderation_note" text;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "featured_at" timestamp;--> statement-breakpoint
ALTER TABLE "project_moderation_event" ADD CONSTRAINT "project_moderation_event_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_moderation_event" ADD CONSTRAINT "project_moderation_event_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_moderation_event_project_created_idx" ON "project_moderation_event" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "project_moderation_event_actor_idx" ON "project_moderation_event" USING btree ("actor_user_id");--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_reviewed_by_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_reviewed_by_idx" ON "project" USING btree ("reviewed_by");--> statement-breakpoint
CREATE INDEX "project_featured_at_idx" ON "project" USING btree ("featured_at");