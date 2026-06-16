import { z } from 'zod';

/** A single taxonomy term in the public response. */
export const taxonomyTermSchema = z.object({
  id: z.string().uuid(),
  label: z.string(),
  slug: z.string(),
  parentId: z.string().uuid().nullable(),
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
  parentId: z.string().uuid().optional(),
});
export type ListTaxonomyQuery = z.infer<typeof listTaxonomyQuerySchema>;
