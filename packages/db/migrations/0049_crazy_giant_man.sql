CREATE TABLE "user_context_preference" (
	"user_id" text PRIMARY KEY NOT NULL,
	"context_kind" text NOT NULL,
	"organization_id" text,
	"team_id" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_context_preference_shape_check" CHECK (("user_context_preference"."context_kind" = 'personal' and "user_context_preference"."organization_id" is null and "user_context_preference"."team_id" is null) or ("user_context_preference"."context_kind" = 'organization' and "user_context_preference"."organization_id" is not null and "user_context_preference"."team_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "user_context_preference" ADD CONSTRAINT "user_context_preference_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_context_preference" ADD CONSTRAINT "user_context_preference_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_context_preference" ADD CONSTRAINT "user_context_preference_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_context_preference_organizationId_idx" ON "user_context_preference" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "user_context_preference_teamId_idx" ON "user_context_preference" USING btree ("team_id");