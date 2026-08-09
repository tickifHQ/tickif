CREATE TYPE "public"."interaction_event_type" AS ENUM('project_view', 'profile_view');--> statement-breakpoint
CREATE TABLE "interaction_event" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "interaction_event_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"event_key" uuid NOT NULL,
	"type" "interaction_event_type" NOT NULL,
	"anonymous_id" uuid NOT NULL,
	"actor_user_id" text,
	"project_id" uuid,
	"designer_profile_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "interaction_event_target_check" CHECK (
        ("interaction_event"."type" = 'project_view' AND "interaction_event"."project_id" IS NOT NULL AND "interaction_event"."designer_profile_id" IS NULL)
        OR
        ("interaction_event"."type" = 'profile_view' AND "interaction_event"."project_id" IS NULL AND "interaction_event"."designer_profile_id" IS NOT NULL)
      )
);
--> statement-breakpoint
ALTER TABLE "interaction_event" ADD CONSTRAINT "interaction_event_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interaction_event" ADD CONSTRAINT "interaction_event_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interaction_event" ADD CONSTRAINT "interaction_event_designer_profile_id_designer_profile_id_fk" FOREIGN KEY ("designer_profile_id") REFERENCES "public"."designer_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "interaction_event_event_key_uniq" ON "interaction_event" USING btree ("event_key");--> statement-breakpoint
CREATE INDEX "interaction_event_project_created_idx" ON "interaction_event" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "interaction_event_profile_created_idx" ON "interaction_event" USING btree ("designer_profile_id","created_at");--> statement-breakpoint
CREATE INDEX "interaction_event_actor_created_idx" ON "interaction_event" USING btree ("actor_user_id","created_at");--> statement-breakpoint
CREATE INDEX "interaction_event_anonymous_created_idx" ON "interaction_event" USING btree ("anonymous_id","created_at");