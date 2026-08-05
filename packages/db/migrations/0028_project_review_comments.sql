CREATE TYPE "public"."project_review_comment_status" AS ENUM('unresolved', 'resolved');--> statement-breakpoint
CREATE TABLE "project_review_comment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"author_id" text,
	"body" text NOT NULL,
	"status" "project_review_comment_status" DEFAULT 'unresolved' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_review_comment" ADD CONSTRAINT "project_review_comment_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_review_comment" ADD CONSTRAINT "project_review_comment_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_review_comment_project_idx" ON "project_review_comment" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_review_comment_project_unresolved_idx" ON "project_review_comment" USING btree ("project_id","status") WHERE "project_review_comment"."status" = 'unresolved';