CREATE TABLE "billing_abandoned_checkout" (
	"razorpay_subscription_id" text PRIMARY KEY NOT NULL,
	"resolved_at" timestamp with time zone,
	"organization_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "billing_abandoned_checkout" ADD CONSTRAINT "billing_abandoned_checkout_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "billing_abandoned_checkout_org_idx" ON "billing_abandoned_checkout" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "billing_abandoned_checkout_sweep_idx" ON "billing_abandoned_checkout" USING btree ("updated_at");