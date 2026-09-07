CREATE TABLE "project_pending_version" (
	"project_id" uuid PRIMARY KEY NOT NULL,
	"content" jsonb NOT NULL,
	"status" "project_status" DEFAULT 'draft' NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "project_pending_version_status_valid" CHECK ("project_pending_version"."status"::text in ('draft', 'submitted', 'in_review', 'changes_requested'))
);
--> statement-breakpoint
ALTER TABLE "project_image" ADD COLUMN "is_live" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "project_room" ADD COLUMN "is_live" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "project_pending_version" ADD CONSTRAINT "project_pending_version_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_pending_version_status_idx" ON "project_pending_version" USING btree ("status");
