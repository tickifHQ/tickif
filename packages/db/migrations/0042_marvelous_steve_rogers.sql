ALTER TABLE "member" ADD COLUMN "frozen" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "member" ADD COLUMN "frozen_at" timestamp;--> statement-breakpoint
ALTER TABLE "member" ADD COLUMN "freeze_rank" integer;--> statement-breakpoint
CREATE INDEX "member_organizationId_frozen_idx" ON "member" USING btree ("organization_id","frozen");--> statement-breakpoint
UPDATE "member"
SET "role" = CASE
	WHEN 'owner' = ANY(regexp_split_to_array("role", '\\s*,\\s*')) THEN 'owner'
	WHEN 'admin' = ANY(regexp_split_to_array("role", '\\s*,\\s*')) THEN 'admin'
	WHEN 'billing_admin' = ANY(regexp_split_to_array("role", '\\s*,\\s*')) THEN 'billing_admin'
	WHEN 'member' = ANY(regexp_split_to_array("role", '\\s*,\\s*')) THEN 'member'
	WHEN 'viewer' = ANY(regexp_split_to_array("role", '\\s*,\\s*')) THEN 'viewer'
	ELSE 'member'
END;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_role_check" CHECK ("member"."role" in ('owner', 'admin', 'billing_admin', 'member', 'viewer'));--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_freeze_state_check" CHECK (("member"."frozen" = false and "member"."frozen_at" is null and "member"."freeze_rank" is null) or ("member"."frozen" = true and "member"."frozen_at" is not null and "member"."freeze_rank" > 0));
