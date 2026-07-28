CREATE TYPE "public"."review_moderation_action" AS ENUM('submit', 'edit', 'publish', 'reject', 'dispute', 'resolve_publish', 'remove');--> statement-breakpoint
CREATE TYPE "public"."review_status" AS ENUM('pending', 'published', 'rejected', 'disputed', 'removed');--> statement-breakpoint
CREATE TABLE "review" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"designer_profile_id" uuid NOT NULL,
	"author_user_id" text NOT NULL,
	"project_id" uuid,
	"booking_id" uuid,
	"rating" smallint NOT NULL,
	"body" text,
	"status" "review_status" DEFAULT 'pending' NOT NULL,
	"published_at" timestamp with time zone,
	"disputed_at" timestamp with time zone,
	"moderated_at" timestamp with time zone,
	"moderation_revision" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_rating_check" CHECK ("review"."rating" between 1 and 5),
	CONSTRAINT "review_moderation_revision_check" CHECK ("review"."moderation_revision" >= 0),
	CONSTRAINT "review_body_length_check" CHECK ("review"."body" is null or char_length(btrim("review"."body")) >= 30),
	CONSTRAINT "review_timestamp_order_check" CHECK (
        "review"."updated_at" >= "review"."created_at"
        and ("review"."published_at" is null or "review"."published_at" >= "review"."created_at")
        and ("review"."disputed_at" is null or "review"."disputed_at" >= "review"."created_at")
        and ("review"."moderated_at" is null or "review"."moderated_at" >= "review"."created_at")
      ),
	CONSTRAINT "review_lifecycle_check" CHECK (
        (
          "review"."status" = 'pending'
          and "review"."published_at" is null
          and "review"."disputed_at" is null
          and "review"."moderated_at" is null
        )
        or (
          "review"."status" = 'rejected'
          and "review"."published_at" is null
          and "review"."disputed_at" is null
          and "review"."moderated_at" is not null
        )
        or (
          "review"."status" = 'published'
          and "review"."published_at" is not null
          and "review"."disputed_at" is null
          and "review"."moderated_at" is not null
          and "review"."moderated_at" >= "review"."published_at"
        )
        or (
          "review"."status" = 'disputed'
          and "review"."published_at" is not null
          and "review"."disputed_at" is not null
          and "review"."moderated_at" is not null
          and "review"."disputed_at" >= "review"."published_at"
          and "review"."moderated_at" >= "review"."published_at"
          and "review"."moderated_at" <= "review"."disputed_at"
        )
        or (
          "review"."status" = 'removed'
          and "review"."published_at" is not null
          and "review"."disputed_at" is not null
          and "review"."moderated_at" is not null
          and "review"."disputed_at" >= "review"."published_at"
          and "review"."moderated_at" >= "review"."disputed_at"
        )
      )
);
--> statement-breakpoint
CREATE TABLE "review_moderation_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"review_id" uuid NOT NULL,
	"actor_user_id" text,
	"action" "review_moderation_action" NOT NULL,
	"from_status" "review_status",
	"to_status" "review_status" NOT NULL,
	"note" text,
	"reason_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_moderation_event_transition_check" CHECK (
        ("review_moderation_event"."action" = 'submit' and "review_moderation_event"."from_status" is null and "review_moderation_event"."to_status" = 'pending')
        or (
          "review_moderation_event"."from_status" is not null
          and (
            (
              "review_moderation_event"."action" = 'edit'
              and "review_moderation_event"."from_status" in ('pending', 'published')
              and "review_moderation_event"."to_status" = 'pending'
            )
            or (
              "review_moderation_event"."action" = 'publish'
              and "review_moderation_event"."from_status" = 'pending'
              and "review_moderation_event"."to_status" = 'published'
            )
            or (
              "review_moderation_event"."action" = 'reject'
              and "review_moderation_event"."from_status" = 'pending'
              and "review_moderation_event"."to_status" = 'rejected'
            )
            or (
              "review_moderation_event"."action" = 'dispute'
              and "review_moderation_event"."from_status" = 'published'
              and "review_moderation_event"."to_status" = 'disputed'
            )
            or (
              "review_moderation_event"."action" = 'resolve_publish'
              and "review_moderation_event"."from_status" = 'disputed'
              and "review_moderation_event"."to_status" = 'published'
            )
            or (
              "review_moderation_event"."action" = 'remove'
              and "review_moderation_event"."from_status" = 'disputed'
              and "review_moderation_event"."to_status" = 'removed'
            )
          )
        )
      )
);
--> statement-breakpoint
ALTER TABLE "designer_portfolio" ADD COLUMN "show_tickif_reviews" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "designer_portfolio" ADD COLUMN "show_tickif_overall_rating" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "designer_portfolio" ADD COLUMN "show_tickif_positive_reviews_only" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "designer_portfolio" ADD COLUMN "show_google_reviews" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "designer_portfolio" ADD COLUMN "show_google_overall_rating" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "designer_portfolio" ADD COLUMN "show_google_positive_reviews_only" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "designer_portfolio"
SET
	"show_tickif_reviews" = "show_reviews",
	"show_tickif_overall_rating" = "show_overall_rating",
	"show_tickif_positive_reviews_only" = "show_positive_reviews_only",
	"show_google_reviews" = "show_reviews",
	"show_google_overall_rating" = "show_overall_rating",
	"show_google_positive_reviews_only" = "show_positive_reviews_only";--> statement-breakpoint
CREATE FUNCTION "sync_legacy_review_visibility"() RETURNS trigger AS $$
BEGIN
	IF TG_OP = 'INSERT' THEN
		IF NEW."show_reviews" = false
			AND NEW."show_tickif_reviews" = true
			AND NEW."show_google_reviews" = true THEN
			NEW."show_tickif_reviews" := false;
			NEW."show_google_reviews" := false;
		END IF;
		IF NEW."show_overall_rating" = false
			AND NEW."show_tickif_overall_rating" = true
			AND NEW."show_google_overall_rating" = true THEN
			NEW."show_tickif_overall_rating" := false;
			NEW."show_google_overall_rating" := false;
		END IF;
		IF NEW."show_positive_reviews_only" = true
			AND NEW."show_tickif_positive_reviews_only" = false
			AND NEW."show_google_positive_reviews_only" = false THEN
			NEW."show_tickif_positive_reviews_only" := true;
			NEW."show_google_positive_reviews_only" := true;
		END IF;
	ELSE
		IF NEW."show_reviews" IS DISTINCT FROM OLD."show_reviews" THEN
			NEW."show_tickif_reviews" := NEW."show_reviews";
			NEW."show_google_reviews" := NEW."show_reviews";
		END IF;
		IF NEW."show_overall_rating" IS DISTINCT FROM OLD."show_overall_rating" THEN
			NEW."show_tickif_overall_rating" := NEW."show_overall_rating";
			NEW."show_google_overall_rating" := NEW."show_overall_rating";
		END IF;
		IF NEW."show_positive_reviews_only" IS DISTINCT FROM OLD."show_positive_reviews_only" THEN
			NEW."show_tickif_positive_reviews_only" := NEW."show_positive_reviews_only";
			NEW."show_google_positive_reviews_only" := NEW."show_positive_reviews_only";
		END IF;
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "designer_portfolio_legacy_review_visibility"
BEFORE INSERT OR UPDATE OF
	"show_reviews",
	"show_overall_rating",
	"show_positive_reviews_only"
ON "designer_portfolio"
FOR EACH ROW
EXECUTE FUNCTION "sync_legacy_review_visibility"();--> statement-breakpoint
ALTER TABLE "review" ADD CONSTRAINT "review_designer_profile_id_designer_profile_id_fk" FOREIGN KEY ("designer_profile_id") REFERENCES "public"."designer_profile"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review" ADD CONSTRAINT "review_author_user_id_user_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review" ADD CONSTRAINT "review_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review" ADD CONSTRAINT "review_booking_id_consultation_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."consultation_booking"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_moderation_event" ADD CONSTRAINT "review_moderation_event_review_id_review_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."review"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_moderation_event" ADD CONSTRAINT "review_moderation_event_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "review_designer_author_uniq" ON "review" USING btree ("designer_profile_id","author_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "review_booking_uniq" ON "review" USING btree ("booking_id") WHERE "review"."booking_id" is not null;--> statement-breakpoint
CREATE INDEX "review_author_user_idx" ON "review" USING btree ("author_user_id");--> statement-breakpoint
CREATE INDEX "review_project_idx" ON "review" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "review_designer_published_idx" ON "review" USING btree ("designer_profile_id","published_at","id") WHERE "review"."status" = 'published';--> statement-breakpoint
CREATE INDEX "review_status_updated_idx" ON "review" USING btree ("status","updated_at","id");--> statement-breakpoint
CREATE INDEX "review_moderation_event_review_created_idx" ON "review_moderation_event" USING btree ("review_id","created_at","id");--> statement-breakpoint
CREATE INDEX "review_moderation_event_actor_idx" ON "review_moderation_event" USING btree ("actor_user_id");
