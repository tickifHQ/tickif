CREATE TABLE "project_room" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"room_type_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "cover_image_id" uuid;--> statement-breakpoint
ALTER TABLE "project_room" ADD CONSTRAINT "project_room_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_room" ADD CONSTRAINT "project_room_room_type_id_taxonomy_id_fk" FOREIGN KEY ("room_type_id") REFERENCES "public"."taxonomy"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_room_project_idx" ON "project_room" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_room_project_sort_idx" ON "project_room" USING btree ("project_id","sort_order","created_at");--> statement-breakpoint
CREATE INDEX "project_room_type_idx" ON "project_room" USING btree ("room_type_id");--> statement-breakpoint
CREATE INDEX "project_image_room_idx" ON "project_image" USING btree ("room_id");--> statement-breakpoint
ALTER TABLE "project_image" ADD CONSTRAINT "project_image_room_id_project_room_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."project_room"("id") ON DELETE set null ON UPDATE no action;
