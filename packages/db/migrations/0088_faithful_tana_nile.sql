DROP INDEX "billing_replacement_open_org_unique";--> statement-breakpoint
ALTER TABLE "billing_replacement" ADD COLUMN "supersedes_id" uuid;--> statement-breakpoint
ALTER TABLE "billing_replacement" ADD CONSTRAINT "billing_replacement_supersedes_id_billing_replacement_id_fk" FOREIGN KEY ("supersedes_id") REFERENCES "public"."billing_replacement"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "billing_replacement_supersedes_idx" ON "billing_replacement" USING btree ("supersedes_id");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_replacement_pending_org_unique" ON "billing_replacement" USING btree ("organization_id") WHERE "billing_replacement"."status" in ('creating', 'checkout', 'aborting');--> statement-breakpoint
CREATE UNIQUE INDEX "billing_replacement_confirmed_org_unique" ON "billing_replacement" USING btree ("organization_id") WHERE "billing_replacement"."status" = 'confirmed';