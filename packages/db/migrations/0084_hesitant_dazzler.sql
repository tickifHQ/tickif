CREATE TABLE "designer_follow" (
	"user_id" text NOT NULL,
	"designer_profile_id" uuid NOT NULL,
	"followed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "designer_follow_user_id_designer_profile_id_pk" PRIMARY KEY("user_id","designer_profile_id")
);
--> statement-breakpoint
ALTER TABLE "designer_follow" ADD CONSTRAINT "designer_follow_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "designer_follow" ADD CONSTRAINT "designer_follow_designer_profile_id_designer_profile_id_fk" FOREIGN KEY ("designer_profile_id") REFERENCES "public"."designer_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "designer_follow_profile_idx" ON "designer_follow" USING btree ("designer_profile_id");--> statement-breakpoint
CREATE INDEX "designer_follow_user_order_idx" ON "designer_follow" USING btree ("user_id","followed_at","designer_profile_id");