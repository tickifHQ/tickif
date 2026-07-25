CREATE TYPE "public"."booking_cancelled_by" AS ENUM('requester', 'designer');--> statement-breakpoint
CREATE TYPE "public"."booking_status" AS ENUM('requested', 'confirmed', 'completed', 'cancelled');--> statement-breakpoint
CREATE TABLE "booking_notification_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"phone_number" text NOT NULL,
	"requester_name" text NOT NULL,
	"enqueued_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booking_notification_outbox_booking_id_unique" UNIQUE("booking_id")
);
--> statement-breakpoint
CREATE TABLE "consultation_booking" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"designer_profile_id" uuid NOT NULL,
	"requester_id" text NOT NULL,
	"referred_project_id" uuid,
	"preferred_slots" jsonb NOT NULL,
	"confirmed_slot" jsonb,
	"message" text,
	"status" "booking_status" DEFAULT 'requested' NOT NULL,
	"cancelled_by" "booking_cancelled_by",
	"cancelled_by_user_id" text,
	"cancel_reason" text,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "consultation_booking_preferred_slots_count_check" CHECK (jsonb_typeof("consultation_booking"."preferred_slots") = 'array' AND jsonb_array_length("consultation_booking"."preferred_slots") BETWEEN 1 AND 3),
	CONSTRAINT "consultation_booking_confirmed_slot_check" CHECK ("consultation_booking"."confirmed_slot" IS NULL OR "consultation_booking"."preferred_slots" @> jsonb_build_array("consultation_booking"."confirmed_slot")),
	CONSTRAINT "consultation_booking_lifecycle_check" CHECK (
        (
          "consultation_booking"."status" = 'requested'
          AND "consultation_booking"."confirmed_slot" IS NULL
          AND "consultation_booking"."confirmed_at" IS NULL
          AND "consultation_booking"."completed_at" IS NULL
          AND "consultation_booking"."cancelled_at" IS NULL
          AND "consultation_booking"."cancelled_by" IS NULL
          AND "consultation_booking"."cancelled_by_user_id" IS NULL
          AND "consultation_booking"."cancel_reason" IS NULL
        )
        OR (
          "consultation_booking"."status" = 'confirmed'
          AND "consultation_booking"."confirmed_slot" IS NOT NULL
          AND "consultation_booking"."confirmed_at" IS NOT NULL
          AND "consultation_booking"."completed_at" IS NULL
          AND "consultation_booking"."cancelled_at" IS NULL
          AND "consultation_booking"."cancelled_by" IS NULL
          AND "consultation_booking"."cancelled_by_user_id" IS NULL
          AND "consultation_booking"."cancel_reason" IS NULL
        )
        OR (
          "consultation_booking"."status" = 'completed'
          AND "consultation_booking"."confirmed_slot" IS NOT NULL
          AND "consultation_booking"."confirmed_at" IS NOT NULL
          AND "consultation_booking"."completed_at" IS NOT NULL
          AND "consultation_booking"."cancelled_at" IS NULL
          AND "consultation_booking"."cancelled_by" IS NULL
          AND "consultation_booking"."cancelled_by_user_id" IS NULL
          AND "consultation_booking"."cancel_reason" IS NULL
        )
        OR (
          "consultation_booking"."status" = 'cancelled'
          AND "consultation_booking"."completed_at" IS NULL
          AND "consultation_booking"."cancelled_at" IS NOT NULL
          AND "consultation_booking"."cancelled_by" IS NOT NULL
          AND "consultation_booking"."cancelled_by_user_id" IS NOT NULL
          AND (
            ("consultation_booking"."confirmed_slot" IS NULL AND "consultation_booking"."confirmed_at" IS NULL)
            OR ("consultation_booking"."confirmed_slot" IS NOT NULL AND "consultation_booking"."confirmed_at" IS NOT NULL)
          )
        )
      ),
	CONSTRAINT "consultation_booking_designer_cancel_reason_check" CHECK ("consultation_booking"."cancelled_by" IS DISTINCT FROM 'designer' OR nullif(btrim("consultation_booking"."cancel_reason"), '') IS NOT NULL),
	CONSTRAINT "consultation_booking_timestamp_order_check" CHECK (
        ("consultation_booking"."confirmed_at" IS NULL OR "consultation_booking"."confirmed_at" >= "consultation_booking"."requested_at")
        AND ("consultation_booking"."completed_at" IS NULL OR "consultation_booking"."completed_at" >= "consultation_booking"."confirmed_at")
        AND ("consultation_booking"."cancelled_at" IS NULL OR "consultation_booking"."cancelled_at" >= "consultation_booking"."requested_at")
        AND ("consultation_booking"."cancelled_at" IS NULL OR "consultation_booking"."confirmed_at" IS NULL OR "consultation_booking"."cancelled_at" >= "consultation_booking"."confirmed_at")
      )
);
--> statement-breakpoint
ALTER TABLE "booking_notification_outbox" ADD CONSTRAINT "booking_notification_outbox_booking_id_consultation_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."consultation_booking"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultation_booking" ADD CONSTRAINT "consultation_booking_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultation_booking" ADD CONSTRAINT "consultation_booking_designer_profile_id_designer_profile_id_fk" FOREIGN KEY ("designer_profile_id") REFERENCES "public"."designer_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultation_booking" ADD CONSTRAINT "consultation_booking_requester_id_user_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultation_booking" ADD CONSTRAINT "consultation_booking_referred_project_id_project_id_fk" FOREIGN KEY ("referred_project_id") REFERENCES "public"."project"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultation_booking" ADD CONSTRAINT "consultation_booking_cancelled_by_user_id_user_id_fk" FOREIGN KEY ("cancelled_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "booking_notification_outbox_pending_idx" ON "booking_notification_outbox" USING btree ("created_at","id") WHERE "booking_notification_outbox"."enqueued_at" IS NULL;--> statement-breakpoint
CREATE INDEX "consultation_booking_organization_idx" ON "consultation_booking" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "consultation_booking_designer_profile_idx" ON "consultation_booking" USING btree ("designer_profile_id");--> statement-breakpoint
CREATE INDEX "consultation_booking_requester_idx" ON "consultation_booking" USING btree ("requester_id");--> statement-breakpoint
CREATE INDEX "consultation_booking_referred_project_idx" ON "consultation_booking" USING btree ("referred_project_id");--> statement-breakpoint
CREATE INDEX "consultation_booking_requester_designer_status_idx" ON "consultation_booking" USING btree ("requester_id","designer_profile_id","status");--> statement-breakpoint
CREATE INDEX "consultation_booking_org_status_requested_idx" ON "consultation_booking" USING btree ("organization_id","status","requested_at");