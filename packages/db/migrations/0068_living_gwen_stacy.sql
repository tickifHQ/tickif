CREATE TABLE "search_activity" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "search_activity_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"actor_user_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"query" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "search_activity" ADD CONSTRAINT "search_activity_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "search_activity_actor_created_idx" ON "search_activity" USING btree ("actor_user_id","created_at");--> statement-breakpoint
CREATE INDEX "search_activity_created_idx" ON "search_activity" USING btree ("created_at");