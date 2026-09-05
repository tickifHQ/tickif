CREATE TYPE "public"."ownership_transfer_status" AS ENUM('pending', 'accepted', 'declined', 'cancelled', 'expired');--> statement-breakpoint
CREATE TABLE "ownership_transfer_audit_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transfer_id" uuid NOT NULL,
	"status" "ownership_transfer_status" NOT NULL,
	"actor_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ownership_transfer_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"initiator_user_id" text,
	"target_user_id" text,
	"target_member_id" text NOT NULL,
	"status" "ownership_transfer_status" DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ownership_transfer_distinct_parties_check" CHECK ("ownership_transfer_request"."initiator_user_id" <> "ownership_transfer_request"."target_user_id"),
	CONSTRAINT "ownership_transfer_resolution_check" CHECK (("ownership_transfer_request"."status" = 'pending' and "ownership_transfer_request"."resolved_at" is null) or ("ownership_transfer_request"."status" <> 'pending' and "ownership_transfer_request"."resolved_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "ownership_transfer_audit_event" ADD CONSTRAINT "ownership_transfer_audit_event_transfer_id_ownership_transfer_request_id_fk" FOREIGN KEY ("transfer_id") REFERENCES "public"."ownership_transfer_request"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ownership_transfer_audit_event" ADD CONSTRAINT "ownership_transfer_audit_event_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ownership_transfer_request" ADD CONSTRAINT "ownership_transfer_request_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ownership_transfer_request" ADD CONSTRAINT "ownership_transfer_request_initiator_user_id_user_id_fk" FOREIGN KEY ("initiator_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ownership_transfer_request" ADD CONSTRAINT "ownership_transfer_request_target_user_id_user_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ownership_transfer_audit_status_uniq" ON "ownership_transfer_audit_event" USING btree ("transfer_id","status");--> statement-breakpoint
CREATE INDEX "ownership_transfer_audit_transfer_idx" ON "ownership_transfer_audit_event" USING btree ("transfer_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ownership_transfer_pending_organization_uniq" ON "ownership_transfer_request" USING btree ("organization_id") WHERE "ownership_transfer_request"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "ownership_transfer_target_status_idx" ON "ownership_transfer_request" USING btree ("target_user_id","status");--> statement-breakpoint
CREATE INDEX "ownership_transfer_expiry_idx" ON "ownership_transfer_request" USING btree ("expires_at") WHERE "ownership_transfer_request"."status" = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "invitation_pending_organization_email_uniq" ON "invitation" USING btree ("organization_id",lower("email")) WHERE "invitation"."status" = 'pending';--> statement-breakpoint
WITH "ranked_owners" AS (
	SELECT
		"id",
		row_number() OVER (
			PARTITION BY "organization_id"
			ORDER BY "frozen" ASC, "created_at" ASC, "id" ASC
		) AS "owner_rank"
	FROM "member"
	WHERE "role" = 'owner'
)
UPDATE "member"
SET "role" = 'admin'
FROM "ranked_owners"
WHERE
	"member"."id" = "ranked_owners"."id"
	AND "ranked_owners"."owner_rank" > 1;--> statement-breakpoint
CREATE UNIQUE INDEX "member_one_owner_per_organization_uniq" ON "member" USING btree ("organization_id") WHERE "member"."role" = 'owner';
