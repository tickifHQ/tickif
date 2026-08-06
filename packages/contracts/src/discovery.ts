import { z } from 'zod';

/**
 * Discovery feed contracts — single source of truth for the public discovery
 * feed endpoint (E-267). Used by both the Hono API and Next.js web app.
 * Plain zod, no framework deps.
 */

// Helper for filter parameters that accept single string or array of strings
const taxonomySlugOrArray = z.union([
  z.string().trim().min(1).max(80),
  z.array(z.string().trim().min(1).max(80)),
]);

export const discoveryFeedQuerySchema = z
  .object({
    sort: z.enum(['recent', 'featured']).default('recent'),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(48).default(24),
    // Filter parameters
    citySlug: taxonomySlugOrArray.optional(),
    localitySlug: taxonomySlugOrArray.optional(),
    propertyTypeSlug: taxonomySlugOrArray.optional(),
    propertySubtypeSlug: taxonomySlugOrArray.optional(),
    scopeSlug: taxonomySlugOrArray.optional(),
    bhkSlug: taxonomySlugOrArray.optional(),
    budgetBandSlug: taxonomySlugOrArray.optional(),
  })
  .refine((data) => data.page * data.limit <= 1000, {
    message: 'Maximum pagination window exceeded (page × limit must be ≤ 1000)',
    path: ['page'],
  })
  .meta({ id: 'DiscoveryFeedQuery' });

export type DiscoveryFeedQuery = z.infer<typeof discoveryFeedQuerySchema>;

export const discoveryCardSchema = z
  .object({
    slug: z.string(),
    title: z.string(),
    coverImageUrl: z.string().url().nullable(),
    coverImageWidth: z.number().int().nullable(),
    coverImageHeight: z.number().int().nullable(),
    designerName: z.string(),
    designerSlug: z.string().nullable(),
    city: z.string().nullable(),
    bhk: z.string().nullable(),
    ratingSnippet: z.string().nullable(),
  })
  .meta({ id: 'DiscoveryCard' });

export type DiscoveryCard = z.infer<typeof discoveryCardSchema>;

export const discoveryFeedResponseSchema = z
  .object({
    items: z.array(discoveryCardSchema),
    page: z.number().int(),
    limit: z.number().int(),
    hasMore: z.boolean(),
    source: z.enum(['search', 'db']),
  })
  .meta({ id: 'DiscoveryFeedResponse' });

export type DiscoveryFeedResponse = z.infer<typeof discoveryFeedResponseSchema>;
