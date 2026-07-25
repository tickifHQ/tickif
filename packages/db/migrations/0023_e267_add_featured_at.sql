-- E-267: Add featured_at timestamp for discovery feed featured sort.
-- Nullable because most projects are never featured; admin sets this explicitly.

ALTER TABLE "project" ADD COLUMN "featured_at" timestamp with time zone;

-- Partial index: only indexes the few featured rows, not the entire table.
-- Serves the ORDER BY featured_at DESC NULLS LAST query efficiently.
CREATE INDEX "project_featured_at_idx"
  ON "project" ("featured_at" DESC NULLS LAST)
  WHERE "featured_at" IS NOT NULL;
