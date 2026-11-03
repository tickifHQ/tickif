CREATE TABLE "whatsapp_challenge" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"target" text NOT NULL,
	"phone_number" text NOT NULL,
	"code_hash" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"verified_at" timestamp,
	"consumed_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "whatsapp_challenge" ADD CONSTRAINT "whatsapp_challenge_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "whatsapp_challenge_user_created_idx" ON "whatsapp_challenge" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "whatsapp_challenge_expiry_idx" ON "whatsapp_challenge" USING btree ("expires_at");