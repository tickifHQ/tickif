CREATE TYPE "public"."verification_application_status" AS ENUM('draft', 'pending', 'verified', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."verification_document_status" AS ENUM('pending_upload', 'uploaded', 'verified', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."verification_document_type" AS ENUM('personal_pan', 'aadhaar', 'gst_registration_certificate', 'msme_udyam_registration', 'shop_establishment_licence', 'business_pan', 'certificate_of_incorporation');--> statement-breakpoint
CREATE TYPE "public"."verification_notification_event" AS ENUM('verification_approved', 'verification_changes_requested');--> statement-breakpoint
CREATE TYPE "public"."verification_review_action" AS ENUM('submitted', 'resubmitted', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "verification_application" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"status" "verification_application_status" DEFAULT 'draft' NOT NULL,
	"attempt" integer DEFAULT 1 NOT NULL,
	"submitted_at" timestamp with time zone,
	"reviewed_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"reviewed_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "verification_application_organization_id_unique" UNIQUE("organization_id"),
	CONSTRAINT "verification_application_attempt_check" CHECK ("verification_application"."attempt" >= 1),
	CONSTRAINT "verification_application_lifecycle_check" CHECK (
        ("verification_application"."status" = 'draft' AND "verification_application"."submitted_at" IS NULL AND "verification_application"."reviewed_at" IS NULL
          AND "verification_application"."approved_at" IS NULL AND "verification_application"."expires_at" IS NULL)
        OR ("verification_application"."status" = 'pending' AND "verification_application"."submitted_at" IS NOT NULL AND "verification_application"."reviewed_at" IS NULL
          AND "verification_application"."approved_at" IS NULL AND "verification_application"."expires_at" IS NULL)
        OR ("verification_application"."status" = 'rejected' AND "verification_application"."submitted_at" IS NOT NULL AND "verification_application"."reviewed_at" IS NOT NULL
          AND "verification_application"."approved_at" IS NULL AND "verification_application"."expires_at" IS NULL)
        OR ("verification_application"."status" = 'verified' AND "verification_application"."submitted_at" IS NOT NULL AND "verification_application"."reviewed_at" IS NOT NULL
          AND "verification_application"."approved_at" IS NOT NULL AND "verification_application"."expires_at" IS NOT NULL)
      )
);
--> statement-breakpoint
CREATE TABLE "verification_document_slot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"type" "verification_document_type" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification_document_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slot_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"object_key" text NOT NULL,
	"content_type" text NOT NULL,
	"content_length" integer NOT NULL,
	"status" "verification_document_status" DEFAULT 'pending_upload' NOT NULL,
	"uploaded_by_user_id" text,
	"committed_at" timestamp with time zone,
	"reviewed_at" timestamp with time zone,
	"reviewed_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "verification_document_version_object_key_unique" UNIQUE("object_key"),
	CONSTRAINT "verification_document_version_positive_check" CHECK ("verification_document_version"."version" >= 1),
	CONSTRAINT "verification_document_content_length_check" CHECK ("verification_document_version"."content_length" > 0),
	CONSTRAINT "verification_document_commit_check" CHECK (("verification_document_version"."status" = 'pending_upload' AND "verification_document_version"."committed_at" IS NULL)
        OR ("verification_document_version"."status" <> 'pending_upload' AND "verification_document_version"."committed_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "verification_notification_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"attempt" integer NOT NULL,
	"event_type" "verification_notification_event" NOT NULL,
	"recipient_user_id" text,
	"recipient_email" text NOT NULL,
	"note" text,
	"enqueued_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "verification_notification_attempt_check" CHECK ("verification_notification_outbox"."attempt" >= 1)
);
--> statement-breakpoint
CREATE TABLE "verification_review_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"attempt" integer NOT NULL,
	"action" "verification_review_action" NOT NULL,
	"actor_user_id" text,
	"from_status" "verification_application_status" NOT NULL,
	"to_status" "verification_application_status" NOT NULL,
	"note" text,
	"rejected_document_version_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "verification_review_event_attempt_check" CHECK ("verification_review_event"."attempt" >= 1)
);
--> statement-breakpoint
ALTER TABLE "verification_application" ADD CONSTRAINT "verification_application_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_application" ADD CONSTRAINT "verification_application_reviewed_by_user_id_user_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_document_slot" ADD CONSTRAINT "verification_document_slot_application_id_verification_application_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."verification_application"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_document_version" ADD CONSTRAINT "verification_document_version_slot_id_verification_document_slot_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."verification_document_slot"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_document_version" ADD CONSTRAINT "verification_document_version_uploaded_by_user_id_user_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_document_version" ADD CONSTRAINT "verification_document_version_reviewed_by_user_id_user_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_notification_outbox" ADD CONSTRAINT "verification_notification_outbox_application_id_verification_application_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."verification_application"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_notification_outbox" ADD CONSTRAINT "verification_notification_outbox_recipient_user_id_user_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_review_event" ADD CONSTRAINT "verification_review_event_application_id_verification_application_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."verification_application"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_review_event" ADD CONSTRAINT "verification_review_event_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "verification_application_pending_queue_idx" ON "verification_application" USING btree ("submitted_at","id") WHERE "verification_application"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "verification_application_verified_expiry_idx" ON "verification_application" USING btree ("expires_at","id") WHERE "verification_application"."status" = 'verified';--> statement-breakpoint
CREATE INDEX "verification_application_reviewer_idx" ON "verification_application" USING btree ("reviewed_by_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "verification_document_slot_application_type_uniq" ON "verification_document_slot" USING btree ("application_id","type");--> statement-breakpoint
CREATE UNIQUE INDEX "verification_document_version_slot_version_uniq" ON "verification_document_version" USING btree ("slot_id","version");--> statement-breakpoint
CREATE INDEX "verification_document_version_uploader_idx" ON "verification_document_version" USING btree ("uploaded_by_user_id");--> statement-breakpoint
CREATE INDEX "verification_document_version_reviewer_idx" ON "verification_document_version" USING btree ("reviewed_by_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "verification_notification_application_attempt_event_uniq" ON "verification_notification_outbox" USING btree ("application_id","attempt","event_type");--> statement-breakpoint
CREATE INDEX "verification_notification_pending_idx" ON "verification_notification_outbox" USING btree ("created_at","id") WHERE "verification_notification_outbox"."enqueued_at" IS NULL;--> statement-breakpoint
CREATE INDEX "verification_notification_recipient_idx" ON "verification_notification_outbox" USING btree ("recipient_user_id");--> statement-breakpoint
CREATE INDEX "verification_review_event_application_created_idx" ON "verification_review_event" USING btree ("application_id","created_at","id");--> statement-breakpoint
CREATE INDEX "verification_review_event_actor_idx" ON "verification_review_event" USING btree ("actor_user_id");