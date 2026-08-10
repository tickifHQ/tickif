CREATE INDEX "project_bhk_idx" ON "project" USING btree ("bhk_slug");--> statement-breakpoint
CREATE INDEX "project_budget_band_idx" ON "project" USING btree ("budget_band_slug");--> statement-breakpoint
CREATE INDEX "project_image_theme_slugs_gin" ON "project_image" USING gin ("theme_slugs");