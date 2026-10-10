ALTER TABLE "visitor_profile" ADD COLUMN "home_type" text;--> statement-breakpoint
ALTER TABLE "visitor_profile" ADD COLUMN "city_id" uuid;--> statement-breakpoint
ALTER TABLE "visitor_profile" ADD COLUMN "locality_id" uuid;--> statement-breakpoint
ALTER TABLE "visitor_profile" ADD CONSTRAINT "visitor_profile_city_id_taxonomy_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."taxonomy"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visitor_profile" ADD CONSTRAINT "visitor_profile_locality_id_taxonomy_id_fk" FOREIGN KEY ("locality_id") REFERENCES "public"."taxonomy"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "visitor_profile_city_idx" ON "visitor_profile" USING btree ("city_id");--> statement-breakpoint
CREATE INDEX "visitor_profile_locality_idx" ON "visitor_profile" USING btree ("locality_id");--> statement-breakpoint
ALTER TABLE "visitor_profile" ADD CONSTRAINT "visitor_profile_home_type_check" CHECK ("visitor_profile"."home_type" IS NULL OR "visitor_profile"."home_type" IN ('1-bhk', '2-bhk', '3-bhk', '4-plus-bhk', 'villa'));