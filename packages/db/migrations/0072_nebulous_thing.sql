CREATE TYPE "public"."billing_replacement_status" AS ENUM('creating', 'checkout', 'confirmed', 'completed', 'aborting', 'failed');--> statement-breakpoint
CREATE TABLE "billing_replacement" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"source_subscription_id" text NOT NULL,
	"replacement_subscription_id" text,
	"order_id" text,
	"payment_id" text,
	"target_tier" "plan_tier" NOT NULL,
	"source_tier" "plan_tier" NOT NULL,
	"target_plan_id" text NOT NULL,
	"amount" integer NOT NULL,
	"recurring_amount" integer NOT NULL,
	"currency" text NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"status" "billing_replacement_status" DEFAULT 'creating' NOT NULL,
	"source_stopped_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_replacement_replacementSubscriptionId_unique" UNIQUE("replacement_subscription_id"),
	CONSTRAINT "billing_replacement_orderId_unique" UNIQUE("order_id"),
	CONSTRAINT "billing_replacement_paymentId_unique" UNIQUE("payment_id")
);
--> statement-breakpoint
ALTER TABLE "billing_replacement" ADD CONSTRAINT "billing_replacement_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "billing_replacement_org_idx" ON "billing_replacement" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "billing_replacement_source_idx" ON "billing_replacement" USING btree ("source_subscription_id");--> statement-breakpoint
CREATE INDEX "billing_replacement_sweep_idx" ON "billing_replacement" USING btree ("updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_replacement_open_org_unique" ON "billing_replacement" USING btree ("organization_id") WHERE "billing_replacement"."status" not in ('completed', 'failed');