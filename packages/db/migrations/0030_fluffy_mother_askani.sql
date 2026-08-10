CREATE TABLE "visitor_profile" (
	"user_id" text PRIMARY KEY NOT NULL,
	"address" text,
	"whatsapp_number" text,
	"onboarding_completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "visitor_profile_address_length_check" CHECK ("visitor_profile"."address" IS NULL OR char_length(trim("visitor_profile"."address")) BETWEEN 1 AND 300),
	CONSTRAINT "visitor_profile_whatsapp_e164_check" CHECK ("visitor_profile"."whatsapp_number" IS NULL OR "visitor_profile"."whatsapp_number" ~ '^[+][1-9][0-9]{7,14}$')
);
--> statement-breakpoint
ALTER TABLE "visitor_profile" ADD CONSTRAINT "visitor_profile_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;