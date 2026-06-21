import { z } from 'zod';

/** A single taxonomy term in the public response. */
export const taxonomyTermSchema = z.object({
  id: z.uuid(),
  label: z.string(),
  slug: z.string(),
  parentId: z.uuid().nullable(),
});
export type TaxonomyTerm = z.infer<typeof taxonomyTermSchema>;

/** Response shape for GET /api/taxonomy/terms */
export const listTaxonomyResponseSchema = z
  .object({
    terms: z.array(taxonomyTermSchema),
  })
  .meta({ id: 'ListTaxonomyTerms' });
export type ListTaxonomyResponse = z.infer<typeof listTaxonomyResponseSchema>;

/** Query params for GET /api/taxonomy/terms */
export const listTaxonomyQuerySchema = z.object({
  kind: z.string().optional(),
  // UUID format always validated regardless of kind — a malformed parentId is
  // rejected even for non-locality kinds where it's silently ignored at query time.
  parentId: z.uuid().optional(),
});
export type ListTaxonomyQuery = z.infer<typeof listTaxonomyQuerySchema>;
