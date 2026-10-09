ALTER TABLE "subscription" DROP CONSTRAINT "subscription_early_bird_check";--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_early_bird_check" CHECK (
      ("subscription"."early_bird_tier" is null and "subscription"."early_bird_started_at" is null and "subscription"."early_bird_ends_at" is null)
      or ("subscription"."early_bird_tier" is not null and "subscription"."early_bird_tier" in ('professional_plus', 'corporate')
        and "subscription"."early_bird_started_at" is not null and "subscription"."early_bird_ends_at" is not null
        and "subscription"."early_bird_ends_at" > "subscription"."early_bird_started_at"));