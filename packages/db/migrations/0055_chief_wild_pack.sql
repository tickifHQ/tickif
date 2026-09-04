CREATE TABLE "organization_upload_lease" (
	"resource_key" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organization_upload_lease" ADD CONSTRAINT "organization_upload_lease_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "organization_upload_lease_org_expiry_idx" ON "organization_upload_lease" USING btree ("organization_id","expires_at");