import { z } from 'zod';

/**
 * Discovery Feed API contracts (E-267).
 *
 * Defines request/response shapes for the public discovery feed endpoint.
 * Filter allow-listing and Meilisearch-specific configuration live in the
 * discovery module's service layer, not here — contracts stay engine-agnostic.
 *
 * The response contract is identical regardless of whether the data originates
 * from Meilisearch or PostgreSQL. The `source` field is the only indicator.
 */

// ---------------------------------------------------------------------------
// GET /api/discovery/feed — paginated project feed
// ---------------------------------------------------------------------------

export const discoveryFeedQuerySchema = z
  .object({
    sort: z.enum(['recent', 'featured']).default('recent'),
    citySlug: z.array(z.string()).optional(),
    localitySlug: z.array(z.string()).optional(),
    propertyTypeSlug: z.array(z.string()).optional(),
    propertySubtypeSlug: z.array(z.string()).optional(),
    scopeSlug: z.array(z.string()).optional(),
    bhkSlug: z.array(z.string()).optional(),
    budgetBandSlug: z.array(z.string()).optional(),
    themes: z.array(z.string()).optional(),
    materials: z.array(z.string()).optional(),
    finishes: z.array(z.string()).optional(),
    roomSlugs: z.array(z.string()).optional(),
    page: z.coerce.number().int().min(1).max(42).default(1),
    limit: z.coerce.number().int().min(1).max(48).default(24),
  })
  .meta({ id: 'DiscoveryFeedQuery' });
export type DiscoveryFeedQuery = z.infer<typeof discoveryFeedQuerySchema>;

export const discoveryFeedCardSchema = z
  .object({
    slug: z.string(),
    title: z.string(),
    coverImageUrl: z.string().nullable(),
    imageWidth: z.number().int().nullable(),
    imageHeight: z.number().int().nullable(),
    designerName: z.string(),
    designerSlug: z.string().nullable(),
    city: z.string().nullable(),
    locality: z.string().nullable(),
    bhk: z.string().nullable(),
    rating: z.number(),
    reviewCount: z.number().int(),
    budget: z.string().nullable(),
    tags: z.array(z.string()),
  })
  .meta({ id: 'DiscoveryFeedCard' });
export type DiscoveryFeedCard = z.infer<typeof discoveryFeedCardSchema>;

export const discoveryFeedResponseSchema = z
  .object({
    items: z.array(discoveryFeedCardSchema),
    page: z.number().int(),
    limit: z.number().int(),
    hasMore: z.boolean(),
    source: z.enum(['search', 'db']),
  })
  .meta({ id: 'DiscoveryFeedResponse' });
export type DiscoveryFeedResponse = z.infer<typeof discoveryFeedResponseSchema>;
