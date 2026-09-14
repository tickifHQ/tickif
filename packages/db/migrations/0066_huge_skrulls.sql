CREATE TABLE "onboarding_draft" (
	"user_id" text PRIMARY KEY NOT NULL,
	"step" text NOT NULL,
	"fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "onboarding_draft" ADD CONSTRAINT "onboarding_draft_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;