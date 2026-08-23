ALTER TABLE "verification_document_version" ADD COLUMN "removed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "verification_document_version" ADD COLUMN "removed_by_user_id" text;--> statement-breakpoint
ALTER TABLE "verification_document_version" ADD CONSTRAINT "verification_document_version_removed_by_user_id_user_id_fk" FOREIGN KEY ("removed_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "verification_document_version_remover_idx" ON "verification_document_version" USING btree ("removed_by_user_id");--> statement-breakpoint
ALTER TABLE "verification_document_version" ADD CONSTRAINT "verification_document_removal_check" CHECK (("verification_document_version"."status"::text = 'removed' AND "verification_document_version"."removed_at" IS NOT NULL)
        OR ("verification_document_version"."status"::text <> 'removed' AND "verification_document_version"."removed_at" IS NULL));