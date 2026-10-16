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

export const taxonomyKindSchema = z.enum(TAXONOMY_KIND_VALUES).meta({ id: 'TaxonomyKind' });
export type TaxonomyKind = z.infer<typeof taxonomyKindSchema>;

/** Runtime additions and release-changing catalogs must bypass client/server caches. */
const freshTaxonomyKinds = new Set<string>([
  'room',
  'city',
  'locality',
  'material',
  'finish',
  'property_subtype',
  'budget_band',
]);
export function taxonomyNeedsFreshRead(kind: string | null | undefined): boolean {
  return kind != null && freshTaxonomyKinds.has(kind);
}

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

/** Designer-created room types use the same vocabulary as tagging and search. */
export const createRoomTypeSchema = z
  .object({
    label: z.string().trim().min(1).max(80),
  })
  .meta({ id: 'CreateRoomType' });
export type CreateRoomTypeInput = z.infer<typeof createRoomTypeSchema>;

const locationLabel = z
  .string()
  .trim()
  .min(2)
  .max(100)
  .regex(/[\p{L}\p{N}]/u);
/** Combined picker choices also exposed by the material discovery filter. */
export const materialFinishSlugs = [
  'laminate',
  'acrylic-gloss',
  'acrylic-matte',
  'pu',
  'membrane',
  'veneer',
  'glass',
  'fabric',
  'lacquered-glass',
  'stone',
  'metal',
  'upvc',
  'pvc',
  'aluminium',
] as const;
export const createLocationSchema = z
  .object({
    citySlug: z
      .string()
      .max(80)
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
      .optional(),
    cityLabel: locationLabel.optional(),
    localityLabel: locationLabel.optional(),
  })
  .refine((input) => Boolean(input.citySlug) !== Boolean(input.cityLabel), {
    message: 'Provide either an existing city or a new city name.',
  })
  .meta({ id: 'CreateLocation' });
export type CreateLocationInput = z.infer<typeof createLocationSchema>;
export const nearbyLocationSchema = z
  .object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  })
  .meta({ id: 'NearbyLocation' });
export type NearbyLocationInput = z.infer<typeof nearbyLocationSchema>;
export const nearbyLocationResponseSchema = z
  .object({
    city: taxonomyTermSchema,
  })
  .meta({ id: 'NearbyLocationResponse' });

/** Only address components used for city resolution are accepted from the provider. */
export const geocodingResponseSchema = z
  .object({
    results: z
      .array(
        z.object({
          addressComponents: z.array(
            z.object({
              longText: z.string(),
              shortText: z.string().optional(),
              types: z.array(z.string()),
            }),
          ),
        }),
      )
      .default([]),
  })
  .meta({ id: 'GeocodingResponse' });
export const createLocationResponseSchema = z
  .object({
    city: taxonomyTermSchema,
    locality: taxonomyTermSchema.nullable(),
  })
  .meta({ id: 'CreateLocationResponse' });
