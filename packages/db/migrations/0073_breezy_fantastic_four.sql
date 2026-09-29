ALTER TABLE "consultation_booking" ADD COLUMN "lead_id" uuid;--> statement-breakpoint
ALTER TABLE "consultation_booking" ADD CONSTRAINT "consultation_booking_lead_id_lead_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."lead"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
WITH "ranked_bookings" AS (
	SELECT
		"consultation_booking"."id" AS "booking_id",
		"consultation_booking"."organization_id",
		"designer_profile"."team_id",
		"consultation_booking"."referred_project_id",
		"user"."phone_number",
		row_number() OVER (
			PARTITION BY "consultation_booking"."organization_id", "designer_profile"."team_id", "consultation_booking"."referred_project_id", "user"."phone_number"
			ORDER BY "consultation_booking"."requested_at", "consultation_booking"."id"
		) AS "sequence"
	FROM "consultation_booking"
	INNER JOIN "designer_profile" ON "designer_profile"."id" = "consultation_booking"."designer_profile_id"
	INNER JOIN "user" ON "user"."id" = "consultation_booking"."requester_id"
	WHERE "consultation_booking"."lead_id" IS NULL AND "user"."phone_number" IS NOT NULL
),
"ranked_leads" AS (
	SELECT
		"lead"."id" AS "lead_id",
		"lead"."organization_id",
		"lead"."team_id",
		"lead"."referred_project_id",
		"lead"."contact_number",
		row_number() OVER (
			PARTITION BY "lead"."organization_id", "lead"."team_id", "lead"."referred_project_id", "lead"."contact_number"
			ORDER BY "lead"."received_at", "lead"."id"
		) AS "sequence"
	FROM "lead"
	WHERE "lead"."source" = 'consultation'
),
"matches" AS (
	SELECT "ranked_bookings"."booking_id", "ranked_leads"."lead_id"
	FROM "ranked_bookings"
	INNER JOIN "ranked_leads"
		ON "ranked_leads"."organization_id" = "ranked_bookings"."organization_id"
		AND "ranked_leads"."team_id" = "ranked_bookings"."team_id"
		AND "ranked_leads"."referred_project_id" IS NOT DISTINCT FROM "ranked_bookings"."referred_project_id"
		AND "ranked_leads"."contact_number" = "ranked_bookings"."phone_number"
		AND "ranked_leads"."sequence" = "ranked_bookings"."sequence"
)
UPDATE "consultation_booking"
SET "lead_id" = "matches"."lead_id"
FROM "matches"
WHERE "consultation_booking"."id" = "matches"."booking_id";--> statement-breakpoint
CREATE UNIQUE INDEX "consultation_booking_lead_idx" ON "consultation_booking" USING btree ("lead_id");
