import { z } from 'zod';

/** Admin-managed taxonomy kinds, shared with the database enum and every API consumer. */
export const TAXONOMY_KIND_VALUES = [
  'city',
  'locality',
  'property_type',
  'property_subtype',
  'bhk',
  'room',
  'scope',
  'theme',
  'budget_band',
  'material',
  'finish',
  'layout',
  'palette',
  'size_band',
] as const;

export const taxonomyKindSchema = z
  .enum(TAXONOMY_KIND_VALUES)
  .meta({ id: 'TaxonomyKind' });
export type TaxonomyKind = z.infer<typeof taxonomyKindSchema>;

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
export const listTaxonomyQuerySchema = z
  .object({
    // Unknown kinds intentionally degrade to an empty result for older clients.
    // The service narrows this string with taxonomyKindSchema before querying.
    kind: z.string().optional(),
    // UUID format always validated regardless of kind — a malformed parentId is
    // rejected even for non-locality kinds where it's silently ignored at query time.
    parentId: z.uuid().optional(),
  })
  .meta({ id: 'ListTaxonomyQuery' });
export type ListTaxonomyQuery = z.infer<typeof listTaxonomyQuerySchema>;
