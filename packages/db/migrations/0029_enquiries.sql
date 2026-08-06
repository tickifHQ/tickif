CREATE TYPE "public"."enquiry_status" AS ENUM('open', 'responded', 'closed');--> statement-breakpoint
CREATE TABLE "enquiry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requester_id" text NOT NULL,
	"designer_profile_id" uuid NOT NULL,
	"organization_id" text NOT NULL,
	"referred_project_id" uuid,
	"subject" text NOT NULL,
	"description" text NOT NULL,
	"template_used" text,
	"budget" text NOT NULL,
	"timeline" text,
	"status" "enquiry_status" DEFAULT 'open' NOT NULL,
	"lead_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "enquiry" ADD CONSTRAINT "enquiry_requester_id_user_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enquiry" ADD CONSTRAINT "enquiry_designer_profile_id_designer_profile_id_fk" FOREIGN KEY ("designer_profile_id") REFERENCES "public"."designer_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enquiry" ADD CONSTRAINT "enquiry_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enquiry" ADD CONSTRAINT "enquiry_referred_project_id_project_id_fk" FOREIGN KEY ("referred_project_id") REFERENCES "public"."project"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enquiry" ADD CONSTRAINT "enquiry_lead_id_lead_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."lead"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "enquiry_requester_idx" ON "enquiry" USING btree ("requester_id");--> statement-breakpoint
CREATE INDEX "enquiry_designer_profile_idx" ON "enquiry" USING btree ("designer_profile_id");--> statement-breakpoint
CREATE INDEX "enquiry_organization_idx" ON "enquiry" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "enquiry_requester_designer_status_idx" ON "enquiry" USING btree ("requester_id","designer_profile_id","status");