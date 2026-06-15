-- E-35: Enforce one-profile-per-user at the DB level.
-- Partial unique index: only non-NULL user_id values are constrained.
-- This prevents race conditions in onboarding (concurrent double-submit).
CREATE UNIQUE INDEX "designer_profile_user_id_unique" ON "designer_profile" ("user_id") WHERE "user_id" IS NOT NULL;
