ALTER TABLE "lead" ADD COLUMN "assigned_member_id" text;--> statement-breakpoint
ALTER TABLE "lead" ADD CONSTRAINT "lead_assigned_member_id_member_id_fk" FOREIGN KEY ("assigned_member_id") REFERENCES "public"."member"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lead_assigned_member_idx" ON "lead" USING btree ("assigned_member_id");