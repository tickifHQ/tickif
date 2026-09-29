ALTER TABLE "consultation_booking" ADD COLUMN "lead_id" uuid;--> statement-breakpoint
ALTER TABLE "consultation_booking" ADD CONSTRAINT "consultation_booking_lead_id_lead_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."lead"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Historical bookings and leads were inserted in one transaction, so their
-- database-default timestamps agree. Never pair rows by ordinal position:
-- phone changes or missing historical leads can shift those positions.
WITH "candidates" AS (
 SELECT
  "consultation_booking"."id" AS "booking_id",
  "lead"."id" AS "lead_id",
  count(*) OVER (PARTITION BY "consultation_booking"."id") AS "booking_matches",
  count(*) OVER (PARTITION BY "lead"."id") AS "lead_matches"
 FROM "consultation_booking"
 INNER JOIN "designer_profile" ON "designer_profile"."id" = "consultation_booking"."designer_profile_id"
 INNER JOIN "user" ON "user"."id" = "consultation_booking"."requester_id"
 INNER JOIN "lead"
  ON "lead"."organization_id" = "consultation_booking"."organization_id"
  AND "lead"."team_id" = "designer_profile"."team_id"
  AND "lead"."referred_project_id" IS NOT DISTINCT FROM "consultation_booking"."referred_project_id"
  AND "lead"."contact_number" = "user"."phone_number"
  AND "lead"."received_at" = "consultation_booking"."requested_at"
  AND "lead"."source" = 'consultation'
 WHERE "consultation_booking"."lead_id" IS NULL
)
UPDATE "consultation_booking"
SET "lead_id" = "candidates"."lead_id"
FROM "candidates"
WHERE "consultation_booking"."id" = "candidates"."booking_id"
 AND "candidates"."booking_matches" = 1
 AND "candidates"."lead_matches" = 1;--> statement-breakpoint
CREATE UNIQUE INDEX "consultation_booking_lead_idx" ON "consultation_booking" USING btree ("lead_id");
