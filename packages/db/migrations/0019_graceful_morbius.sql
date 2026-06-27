CREATE TYPE "public"."lead_status" AS ENUM('new', 'contacted', 'closed', 'spam');--> statement-breakpoint
CREATE TABLE "lead" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"referred_project_id" uuid,
	"name" text NOT NULL,
	"contact_number" text NOT NULL,
	"budget_band_slug" text,
	"message" text,
	"source" text DEFAULT 'enquiry' NOT NULL,
	"status" "lead_status" DEFAULT 'new' NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lead" ADD CONSTRAINT "lead_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead" ADD CONSTRAINT "lead_referred_project_id_project_id_fk" FOREIGN KEY ("referred_project_id") REFERENCES "public"."project"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lead_organization_idx" ON "lead" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "lead_referred_project_idx" ON "lead" USING btree ("referred_project_id");--> statement-breakpoint
CREATE INDEX "lead_org_status_received_idx" ON "lead" USING btree ("organization_id","status","received_at");