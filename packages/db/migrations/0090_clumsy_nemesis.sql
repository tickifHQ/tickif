DROP INDEX "search_projection_outbox_undispatched_sequence_idx";--> statement-breakpoint
ALTER TABLE "search_projection_outbox" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "search_projection_outbox" ADD COLUMN "next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "search_projection_outbox" ADD COLUMN "last_error" text;--> statement-breakpoint
CREATE INDEX "search_projection_outbox_due_idx" ON "search_projection_outbox" USING btree ("next_attempt_at","sequence") WHERE "search_projection_outbox"."dispatched_at" IS NULL;--> statement-breakpoint
ALTER TABLE "search_projection_outbox" ADD CONSTRAINT "search_projection_outbox_attempts_check" CHECK ("search_projection_outbox"."attempts" >= 0);