CREATE TABLE "saved_project" (
	"user_id" text NOT NULL,
	"project_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "saved_project" ADD CONSTRAINT "saved_project_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_project" ADD CONSTRAINT "saved_project_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "saved_project_user_project_uniq" ON "saved_project" USING btree ("user_id","project_id");--> statement-breakpoint
CREATE INDEX "saved_project_project_idx" ON "saved_project" USING btree ("project_id");