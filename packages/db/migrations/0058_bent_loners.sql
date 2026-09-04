DROP INDEX "payment_transaction_subscription_idx";--> statement-breakpoint
ALTER TABLE "payment_transaction" ADD COLUMN "occurred_at" timestamp with time zone;--> statement-breakpoint
UPDATE "payment_transaction" SET "occurred_at" = "created_at" WHERE "occurred_at" IS NULL;--> statement-breakpoint
ALTER TABLE "payment_transaction" ALTER COLUMN "occurred_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "payment_transaction" ALTER COLUMN "occurred_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "responsible_member_id" text;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_responsible_member_id_member_id_fk" FOREIGN KEY ("responsible_member_id") REFERENCES "public"."member"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_transaction_subscription_occurred_idx" ON "payment_transaction" USING btree ("subscription_id","occurred_at");--> statement-breakpoint
CREATE INDEX "project_responsible_member_idx" ON "project" USING btree ("responsible_member_id");
