INSERT INTO "taxonomy" ("kind", "slug", "label", "sort_order", "metadata") VALUES
('budget_band', 'budget', 'Under ₹5L', 1, '{"min": 0, "max": 500000}'::jsonb),
('budget_band', '5l-10l', '₹5L - ₹10L', 2, '{"min": 500001, "max": 1000000}'::jsonb),
('budget_band', '10l-20l', '₹10L - ₹20L', 3, '{"min": 1000001, "max": 2000000}'::jsonb),
('budget_band', '20l-30l', '₹20L - ₹30L', 4, '{"min": 2000001, "max": 3000000}'::jsonb),
('budget_band', '30l-40l', '₹30L - ₹40L', 5, '{"min": 3000001, "max": 4000000}'::jsonb),
('budget_band', '40l-50l', '₹40L - ₹50L', 6, '{"min": 4000001, "max": 5000000}'::jsonb),
('budget_band', '50l-1cr', '₹50L - ₹1Cr', 7, '{"min": 5000001, "max": 10000000}'::jsonb),
('budget_band', '1cr-plus', '₹1Cr+', 8, '{"min": 10000001, "max": null}'::jsonb)
ON CONFLICT ("kind", "slug") WHERE "parent_id" IS NULL
DO UPDATE SET "label" = excluded."label", "sort_order" = excluded."sort_order",
  "metadata" = excluded."metadata", "updated_at" = now();
--> statement-breakpoint
UPDATE "taxonomy" SET "is_active" = false, "updated_at" = now()
WHERE "kind" = 'budget_band' AND "slug" IN ('moderate', 'upscale', 'luxury');
