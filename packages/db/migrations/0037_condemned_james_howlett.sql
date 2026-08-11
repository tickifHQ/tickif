CREATE TYPE "public"."project_report_reason" AS ENUM('spam', 'misleading', 'inappropriate', 'copyright', 'other');--> statement-breakpoint
CREATE TYPE "public"."project_report_status" AS ENUM('open', 'reviewing', 'resolved', 'dismissed');--> statement-breakpoint
CREATE TABLE "project_report" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_user_id" text NOT NULL,
	"project_id" uuid NOT NULL,
	"reason" "project_report_reason" NOT NULL,
	"details" text,
	"status" "project_report_status" DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_report" ADD CONSTRAINT "project_report_reporter_user_id_user_id_fk" FOREIGN KEY ("reporter_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_report" ADD CONSTRAINT "project_report_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_report_reporter_project_uniq" ON "project_report" USING btree ("reporter_user_id","project_id");--> statement-breakpoint
CREATE INDEX "project_report_project_status_created_idx" ON "project_report" USING btree ("project_id","status","created_at");