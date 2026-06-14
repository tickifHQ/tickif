-- Drops the dead (project_id, phash) index (a btree can't serve fuzzy/Hamming dedup) and adds a
-- covering index for the list query's ORDER BY. On a large/populated table, run the DROP/CREATE
-- INDEX statements CONCURRENTLY out-of-band instead (drizzle wraps each migration in a transaction).
DROP INDEX "project_image_project_phash_idx";--> statement-breakpoint
-- Every new upload sets content_type; backfill any pre-pipeline NULLs to a non-image type so the
-- worker rejects them on validation rather than the migration aborting on the NOT NULL.
UPDATE "project_image" SET "content_type" = 'application/octet-stream' WHERE "content_type" IS NULL;--> statement-breakpoint
ALTER TABLE "project_image" ALTER COLUMN "content_type" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "project_image_project_sort_idx" ON "project_image" USING btree ("project_id","sort_order","created_at");