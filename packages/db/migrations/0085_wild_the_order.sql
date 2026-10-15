CREATE TABLE "enquiry_message" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enquiry_id" uuid NOT NULL,
	"author_id" text,
	"request_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "enquiry" ADD COLUMN "viewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "enquiry" ADD COLUMN "contacted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "enquiry" ADD COLUMN "last_message_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "enquiry" ADD COLUMN "activity_read_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "enquiry_message" ADD CONSTRAINT "enquiry_message_enquiry_id_enquiry_id_fk" FOREIGN KEY ("enquiry_id") REFERENCES "public"."enquiry"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enquiry_message" ADD CONSTRAINT "enquiry_message_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "enquiry_message_order_idx" ON "enquiry_message" USING btree ("enquiry_id","created_at","id");--> statement-breakpoint
CREATE INDEX "enquiry_message_author_idx" ON "enquiry_message" USING btree ("author_id");--> statement-breakpoint
CREATE UNIQUE INDEX "enquiry_message_request_idx" ON "enquiry_message" USING btree ("enquiry_id","request_id");--> statement-breakpoint
CREATE INDEX "enquiry_lead_idx" ON "enquiry" USING btree ("lead_id");