CREATE TYPE "public"."plan_tier" AS ENUM('hobby', 'professional_plus', 'corporate');--> statement-breakpoint
CREATE TYPE "public"."subscription_state" AS ENUM('active', 'payment_failed', 'grace', 'locked', 'downgraded');--> statement-breakpoint
CREATE TABLE "payment_transaction" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" uuid NOT NULL,
	"razorpay_payment_id" text NOT NULL,
	"amount" integer NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"status" text NOT NULL,
	"payload" jsonb,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_transaction_razorpay_payment_id_unique" UNIQUE("razorpay_payment_id"),
	CONSTRAINT "payment_transaction_amount_nonnegative" CHECK ("payment_transaction"."amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "subscription" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"plan_tier" "plan_tier" NOT NULL,
	"subscription_state" "subscription_state" DEFAULT 'active' NOT NULL,
	"razorpay_subscription_id" text,
	"razorpay_status" text,
	"current_period_end" timestamp with time zone,
	"grace_started_at" timestamp with time zone,
	"locked_at" timestamp with time zone,
	"downgraded_at" timestamp with time zone,
	"pre_lapse_tier" "plan_tier",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_organization_id_unique" UNIQUE("organization_id"),
	CONSTRAINT "subscription_razorpay_subscription_id_unique" UNIQUE("razorpay_subscription_id"),
	CONSTRAINT "subscription_lifecycle_check" CHECK (
        (
          "subscription"."subscription_state" = 'active'
          AND "subscription"."grace_started_at" IS NULL
          AND "subscription"."locked_at" IS NULL
          AND "subscription"."downgraded_at" IS NULL
          AND "subscription"."pre_lapse_tier" IS NULL
        )
        OR (
          "subscription"."subscription_state" = 'payment_failed'
          AND "subscription"."grace_started_at" IS NULL
          AND "subscription"."locked_at" IS NULL
          AND "subscription"."downgraded_at" IS NULL
          AND "subscription"."pre_lapse_tier" IS NULL
        )
        OR (
          "subscription"."subscription_state" = 'grace'
          AND "subscription"."grace_started_at" IS NOT NULL
          AND "subscription"."locked_at" IS NULL
          AND "subscription"."downgraded_at" IS NULL
          AND "subscription"."pre_lapse_tier" IS NOT NULL
        )
        OR (
          "subscription"."subscription_state" = 'locked'
          AND "subscription"."grace_started_at" IS NOT NULL
          AND "subscription"."locked_at" IS NOT NULL
          AND "subscription"."downgraded_at" IS NULL
          AND "subscription"."pre_lapse_tier" IS NOT NULL
        )
        OR (
          "subscription"."subscription_state" = 'downgraded'
          AND "subscription"."grace_started_at" IS NOT NULL
          AND "subscription"."locked_at" IS NOT NULL
          AND "subscription"."downgraded_at" IS NOT NULL
          AND "subscription"."pre_lapse_tier" IS NOT NULL
        )
      ),
	CONSTRAINT "subscription_timestamp_order_check" CHECK (
        ("subscription"."locked_at" IS NULL OR "subscription"."grace_started_at" IS NULL OR "subscription"."locked_at" >= "subscription"."grace_started_at")
        AND ("subscription"."downgraded_at" IS NULL OR "subscription"."locked_at" IS NULL OR "subscription"."downgraded_at" >= "subscription"."locked_at")
      )
);
--> statement-breakpoint
ALTER TABLE "payment_transaction" ADD CONSTRAINT "payment_transaction_subscription_id_subscription_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscription"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_transaction_subscription_idx" ON "payment_transaction" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "payment_transaction_status_idx" ON "payment_transaction" USING btree ("status");--> statement-breakpoint
CREATE INDEX "subscription_grace_sweep_idx" ON "subscription" USING btree ("subscription_state","grace_started_at") WHERE "subscription"."subscription_state" = 'grace';--> statement-breakpoint
CREATE INDEX "subscription_locked_sweep_idx" ON "subscription" USING btree ("subscription_state","locked_at") WHERE "subscription"."subscription_state" = 'locked';