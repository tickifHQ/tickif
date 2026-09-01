ALTER TABLE "member" ADD COLUMN "frozen" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "member" ADD COLUMN "frozen_at" timestamp;--> statement-breakpoint
ALTER TABLE "member" ADD COLUMN "freeze_rank" integer;--> statement-breakpoint
CREATE INDEX "member_organizationId_frozen_idx" ON "member" USING btree ("organization_id","frozen");--> statement-breakpoint
UPDATE "member"
SET "role" = CASE
	WHEN 'owner' = ANY(regexp_split_to_array("role", '\s*,\s*')) THEN 'owner'
	WHEN 'admin' = ANY(regexp_split_to_array("role", '\s*,\s*')) THEN 'admin'
	WHEN 'billing_admin' = ANY(regexp_split_to_array("role", '\s*,\s*')) THEN 'billing_admin'
	WHEN 'member' = ANY(regexp_split_to_array("role", '\s*,\s*')) THEN 'member'
	WHEN 'viewer' = ANY(regexp_split_to_array("role", '\s*,\s*')) THEN 'viewer'
	ELSE 'member'
END;--> statement-breakpoint
WITH "ranked_members" AS (
	SELECT
		"member"."id",
		"member"."organization_id",
		"member"."created_at",
		row_number() OVER (
			PARTITION BY "member"."organization_id"
			ORDER BY
				CASE WHEN "member"."role" = 'owner' THEN 0 ELSE 1 END,
				"member"."created_at" ASC,
				"member"."id" ASC
		) AS "active_position"
	FROM "member"
	LEFT JOIN "subscription"
		ON "subscription"."organization_id" = "member"."organization_id"
	WHERE
		"subscription"."organization_id" IS NULL
		OR "subscription"."plan_tier" <> 'corporate'
		OR "subscription"."subscription_state" = 'locked'
),
"freeze_candidates" AS (
	SELECT
		"id",
		row_number() OVER (
			PARTITION BY "organization_id"
			ORDER BY "created_at" DESC, "id" DESC
		) AS "freeze_rank"
	FROM "ranked_members"
	WHERE "active_position" > 1
)
UPDATE "member"
SET
	"frozen" = true,
	"frozen_at" = now(),
	"freeze_rank" = "freeze_candidates"."freeze_rank"
FROM "freeze_candidates"
WHERE "member"."id" = "freeze_candidates"."id";--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_role_check" CHECK ("member"."role" in ('owner', 'admin', 'billing_admin', 'member', 'viewer'));--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_freeze_state_check" CHECK (("member"."frozen" = false and "member"."frozen_at" is null and "member"."freeze_rank" is null) or ("member"."frozen" = true and "member"."frozen_at" is not null and "member"."freeze_rank" > 0));
