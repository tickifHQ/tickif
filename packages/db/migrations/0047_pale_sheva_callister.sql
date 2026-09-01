CREATE TABLE "team" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"organization_id" text NOT NULL,
	"frozen" boolean DEFAULT false NOT NULL,
	"frozen_at" timestamp,
	"freeze_rank" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "team_freeze_state_check" CHECK (("team"."frozen" = false and "team"."frozen_at" is null and "team"."freeze_rank" is null) or ("team"."frozen" = true and "team"."frozen_at" is not null and "team"."freeze_rank" > 0))
);
--> statement-breakpoint
CREATE TABLE "team_member" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invitation" ADD COLUMN "team_id" text;--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "active_team_id" text;--> statement-breakpoint
ALTER TABLE "designer_profile" ADD COLUMN "team_id" text;--> statement-breakpoint
ALTER TABLE "designer_profile" ADD COLUMN "slug" text;--> statement-breakpoint
ALTER TABLE "lead" ADD COLUMN "team_id" text;--> statement-breakpoint
ALTER TABLE "team" ADD CONSTRAINT "team_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_member" ADD CONSTRAINT "team_member_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_member" ADD CONSTRAINT "team_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
INSERT INTO "team" ("id", "name", "organization_id", "created_at", "updated_at")
SELECT 'branch_' || md5("id"), "name", "id", "created_at", "created_at"
FROM "organization";--> statement-breakpoint
INSERT INTO "team_member" ("id", "team_id", "user_id", "created_at")
SELECT 'team_member_' || md5(m."id"), t."id", m."user_id", m."created_at"
FROM "member" m
INNER JOIN "team" t ON t."organization_id" = m."organization_id";--> statement-breakpoint
UPDATE "designer_profile" p
SET "team_id" = t."id", "slug" = o."slug"
FROM "team" t
INNER JOIN "organization" o ON o."id" = t."organization_id"
WHERE p."org_id" = t."organization_id";--> statement-breakpoint
INSERT INTO "designer_profile" ("org_id", "team_id", "display_name", "slug", "entity_type")
SELECT o."id", t."id", o."name", o."slug", 'company'
FROM "organization" o
INNER JOIN "team" t ON t."organization_id" = o."id"
WHERE NOT EXISTS (
	SELECT 1 FROM "designer_profile" p WHERE p."org_id" = o."id"
);--> statement-breakpoint
UPDATE "lead" l
SET "team_id" = t."id"
FROM "team" t
WHERE l."organization_id" = t."organization_id";--> statement-breakpoint
UPDATE "invitation" i
SET "team_id" = t."id"
FROM "team" t
WHERE i."organization_id" = t."organization_id";--> statement-breakpoint
UPDATE "session" s
SET "active_team_id" = t."id"
FROM "team" t
WHERE s."active_organization_id" = t."organization_id";--> statement-breakpoint
ALTER TABLE "designer_profile" ALTER COLUMN "team_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "designer_profile" ALTER COLUMN "slug" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "lead" ALTER COLUMN "team_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "designer_profile" DROP CONSTRAINT "designer_profile_org_id_unique";--> statement-breakpoint
DROP INDEX "designer_profile_user_id_unique";--> statement-breakpoint
CREATE INDEX "team_organizationId_idx" ON "team" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "team_organizationId_frozen_idx" ON "team" USING btree ("organization_id","frozen");--> statement-breakpoint
CREATE UNIQUE INDEX "team_organizationId_name_uniq" ON "team" USING btree ("organization_id",lower("name"));--> statement-breakpoint
CREATE INDEX "teamMember_teamId_idx" ON "team_member" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "teamMember_userId_idx" ON "team_member" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "teamMember_teamId_userId_uniq" ON "team_member" USING btree ("team_id","user_id");--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "designer_profile" ADD CONSTRAINT "designer_profile_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead" ADD CONSTRAINT "lead_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invitation_teamId_idx" ON "invitation" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "designer_profile_team_idx" ON "designer_profile" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "designer_profile_user_idx" ON "designer_profile" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "lead_team_idx" ON "lead" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "lead_team_status_received_idx" ON "lead" USING btree ("team_id","status","received_at");--> statement-breakpoint
ALTER TABLE "designer_profile" ADD CONSTRAINT "designer_profile_team_id_unique" UNIQUE("team_id");--> statement-breakpoint
ALTER TABLE "designer_profile" ADD CONSTRAINT "designer_profile_slug_unique" UNIQUE("slug");
