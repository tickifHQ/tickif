CREATE TYPE "public"."search_projection_entity_kind" AS ENUM('project', 'designer');--> statement-breakpoint
CREATE TYPE "public"."search_projection_operation" AS ENUM('index', 'delete');--> statement-breakpoint
CREATE TABLE "search_projection_outbox" (
	"sequence" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "search_projection_outbox_sequence_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"entity_kind" "search_projection_entity_kind" NOT NULL,
	"entity_id" uuid NOT NULL,
	"operation" "search_projection_operation" NOT NULL,
	"source_updated_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dispatched_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "search_projection_outbox_undispatched_sequence_idx" ON "search_projection_outbox" USING btree ("sequence") WHERE "search_projection_outbox"."dispatched_at" IS NULL;--> statement-breakpoint
CREATE INDEX "search_projection_outbox_entity_sequence_idx" ON "search_projection_outbox" USING btree ("entity_kind","entity_id","sequence");