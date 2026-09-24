CREATE TYPE "public"."billing_operation_kind" AS ENUM('subscribe', 'change_plan', 'cancel', 'recover');--> statement-breakpoint
CREATE TYPE "public"."billing_operation_status" AS ENUM('requested', 'processing', 'reconciliation_pending', 'scheduled', 'activated', 'failed');--> statement-breakpoint
CREATE TYPE "public"."billing_recovery_status" AS ENUM('requested', 'waiting_for_expiry', 'eligible', 'checkout_pending', 'completed', 'dismissed', 'superseded');--> statement-breakpoint
CREATE TABLE "billing_operation" (
	"operation_id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"actor_id" text,
	"target_tier" "plan_tier" NOT NULL,
	"kind" "billing_operation_kind" NOT NULL,
	"source_subscription_id" text,
	"state_revision" text NOT NULL,
	"status" "billing_operation_status" DEFAULT 'processing' NOT NULL,
	"result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_recovery" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"actor_id" text,
	"target_tier" "plan_tier" NOT NULL,
	"source_subscription_id" text NOT NULL,
	"status" "billing_recovery_status" DEFAULT 'requested' NOT NULL,
	"eligible_at" timestamp with time zone,
	"reason" text,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "billing_operation" ADD CONSTRAINT "billing_operation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_operation" ADD CONSTRAINT "billing_operation_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_recovery" ADD CONSTRAINT "billing_recovery_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_recovery" ADD CONSTRAINT "billing_recovery_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "billing_operation_org_idx" ON "billing_operation" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "billing_operation_actor_idx" ON "billing_operation" USING btree ("actor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_operation_open_org_unique" ON "billing_operation" USING btree ("organization_id") WHERE "billing_operation"."status" in ('requested', 'processing', 'reconciliation_pending');--> statement-breakpoint
CREATE UNIQUE INDEX "billing_recovery_open_org_unique" ON "billing_recovery" USING btree ("organization_id") WHERE "billing_recovery"."status" in ('requested', 'waiting_for_expiry', 'eligible', 'checkout_pending');--> statement-breakpoint
CREATE INDEX "billing_recovery_org_idx" ON "billing_recovery" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "billing_recovery_actor_idx" ON "billing_recovery" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "billing_recovery_sweep_idx" ON "billing_recovery" USING btree ("updated_at") WHERE "billing_recovery"."status" in ('requested', 'waiting_for_expiry', 'eligible', 'checkout_pending');