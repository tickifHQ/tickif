ALTER TABLE "subscription" ADD COLUMN "early_bird_tier" "plan_tier";--> statement-breakpoint
ALTER TABLE "subscription" ADD COLUMN "early_bird_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscription" ADD COLUMN "early_bird_ends_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "subscription_early_bird_expiry_idx" ON "subscription" USING btree ("early_bird_ends_at") WHERE "subscription"."early_bird_ends_at" is not null and "subscription"."razorpay_subscription_id" is null and "subscription"."plan_tier" <> 'hobby';--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_early_bird_check" CHECK (
      ("subscription"."early_bird_tier" is null and "subscription"."early_bird_started_at" is null and "subscription"."early_bird_ends_at" is null)
      or ("subscription"."early_bird_tier" in ('professional_plus', 'corporate')
        and "subscription"."early_bird_started_at" is not null and "subscription"."early_bird_ends_at" is not null
        and "subscription"."early_bird_ends_at" > "subscription"."early_bird_started_at"));