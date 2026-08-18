import { z } from 'zod';
import { feedProjectSchema, type FeedProject } from './projects';
import { projectSearchFallback } from './search';

/**
 * Discovery feed contracts — single source of truth for the public discovery
 * feed endpoint (E-267). Used by both the Hono API and Next.js web app.
 * Plain zod, no framework deps.
 */

const taxonomySlug = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use a taxonomy slug such as modern or 3-bhk');

// Helper for filter parameters that accept a single slug or a bounded slug array.
const taxonomySlugOrArray = z.union([taxonomySlug, z.array(taxonomySlug).max(20)]);

export const discoveryFeedQuerySchema = z
  .object({
    sort: z.enum(['recent', 'featured']).default('recent'),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(48).default(24),
    q: z.string().trim().max(200).optional(),
    // Filter parameters
    citySlug: taxonomySlugOrArray.optional(),
    localitySlug: taxonomySlugOrArray.optional(),
    propertyTypeSlug: taxonomySlugOrArray.optional(),
    propertySubtypeSlug: taxonomySlugOrArray.optional(),
    scopeSlug: taxonomySlugOrArray.optional(),
    bhkSlug: taxonomySlugOrArray.optional(),
    budgetBandSlug: taxonomySlugOrArray.optional(),
    roomSlugs: taxonomySlugOrArray.optional(),
    themes: taxonomySlugOrArray.optional(),
  })
  .refine((data) => data.page * data.limit <= 1000, {
    message: 'Maximum pagination window exceeded (page × limit must be ≤ 1000)',
    path: ['page'],
  })
  .meta({ id: 'DiscoveryFeedQuery' });

export type DiscoveryFeedQuery = z.infer<typeof discoveryFeedQuerySchema>;

/** Discovery reuses the canonical public project card without a second shape. */
export const discoveryCardSchema = feedProjectSchema;
export type DiscoveryCard = FeedProject;

export const discoveryFeedResponseSchema = z
  .object({
    items: z.array(discoveryCardSchema),
    page: z.number().int(),
    limit: z.number().int(),
    hasMore: z.boolean(),
    source: z.enum(['search', 'db']),
    facetDistribution: z.record(z.string(), z.record(z.string(), z.number())),
    fallback: projectSearchFallback,
    relaxedFilters: z.array(z.string()),
  })
  .meta({ id: 'DiscoveryFeedResponse' });

export type DiscoveryFeedResponse = z.infer<typeof discoveryFeedResponseSchema>;
