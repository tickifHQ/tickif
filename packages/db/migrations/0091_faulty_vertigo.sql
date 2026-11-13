CREATE TABLE "otp_attempt" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "otp_attempt_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"identifier" text NOT NULL,
	"kind" text NOT NULL,
	"created_at" timestamp NOT NULL,
	CONSTRAINT "otp_attempt_kind_check" CHECK ("otp_attempt"."kind" in ('send', 'wrong_guess'))
);
--> statement-breakpoint
CREATE TABLE "rate_limit" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL,
	CONSTRAINT "rate_limit_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE INDEX "otp_attempt_identifier_created_idx" ON "otp_attempt" USING btree ("identifier","created_at");--> statement-breakpoint
CREATE INDEX "otp_attempt_created_idx" ON "otp_attempt" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "rate_limit_last_request_idx" ON "rate_limit" USING btree ("last_request");