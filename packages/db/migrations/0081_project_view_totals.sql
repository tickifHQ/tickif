CREATE TABLE "project_engagement" (
	"project_id" uuid PRIMARY KEY NOT NULL,
	"view_count" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "project_engagement_views_nonnegative" CHECK ("project_engagement"."view_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "project_engagement" ADD CONSTRAINT "project_engagement_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
-- The migrator runs this file in a transaction. Block event writers across the
-- backfill/trigger cutover so old API instances cannot lose or double-count views.
LOCK TABLE "interaction_event" IN SHARE ROW EXCLUSIVE MODE;
--> statement-breakpoint
INSERT INTO "project_engagement" ("project_id", "view_count")
SELECT "project_id", count(*) FROM "interaction_event"
WHERE "type" = 'project_view' GROUP BY "project_id";
--> statement-breakpoint
CREATE FUNCTION "increment_project_view_total"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO "project_engagement" ("project_id", "view_count")
  VALUES (NEW."project_id", 1)
  ON CONFLICT ("project_id") DO UPDATE
    SET "view_count" = "project_engagement"."view_count" + 1;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
-- AFTER INSERT fires only for accepted rows, not ON CONFLICT DO NOTHING retries.
CREATE TRIGGER "interaction_event_project_view_total"
AFTER INSERT ON "interaction_event"
FOR EACH ROW WHEN (NEW."type" = 'project_view')
EXECUTE FUNCTION "increment_project_view_total"();
