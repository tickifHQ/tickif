import { z } from 'zod';

/**
 * Search API contracts (E-261).
 *
 * Defines request/response shapes for the public search endpoints.
 * Filter allow-listing and Meilisearch-specific configuration live
 * in the search module, not here — contracts stay engine-agnostic.
 */

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

const paginationDefaults = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(48).default(24),
};

// ---------------------------------------------------------------------------
// GET /api/search — project search
// ---------------------------------------------------------------------------

export const searchQuerySchema = z
  .object({
    q: z.string().max(200).default(''),
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
    sort: z.enum(['relevance', 'publishedAt:desc', 'publishedAt:asc', 'sizeSqft:asc', 'sizeSqft:desc']).default('relevance'),
    ...paginationDefaults,
  })
  .refine((data) => data.page * data.limit <= 1000, {
    message: 'Maximum pagination window exceeded',
    path: ['page'],
  })
  .meta({ id: 'SearchQuery' });
export type SearchQuery = z.infer<typeof searchQuerySchema>;

export const searchHitSchema = z
  .object({
    id: z.string(),
    slug: z.string(),
    title: z.string(),
    description: z.string().nullable(),
    designerId: z.string(),
    designerSlug: z.string().nullable(),
    designerName: z.string(),
    citySlug: z.string().nullable(),
    localitySlug: z.string().nullable(),
    propertyTypeSlug: z.string().nullable(),
    bhkSlug: z.string().nullable(),
    budgetBandSlug: z.string().nullable(),
    scopeSlug: z.string().nullable(),
    themes: z.array(z.string()),
    coverImageUrl: z.string().nullable(),
    publishedAt: z.number().int(),
  })
  .meta({ id: 'SearchHit' });
export type SearchHit = z.infer<typeof searchHitSchema>;

export const searchResponseSchema = z
  .object({
    hits: z.array(searchHitSchema),
    estimatedTotalHits: z.number().int(),
    facetDistribution: z.record(z.string(), z.record(z.string(), z.number())).nullable(),
    processingTimeMs: z.number().int(),
    page: z.number().int(),
    limit: z.number().int(),
    relaxedFilters: z.array(z.string()),
    fallback: z.enum(['none', 'relaxed', 'recent_in_city']),
  })
  .meta({ id: 'SearchResponse' });
export type SearchResponse = z.infer<typeof searchResponseSchema>;

// ---------------------------------------------------------------------------
// GET /api/search/suggest — blended suggest (projects + designers)
// ---------------------------------------------------------------------------

export const suggestQuerySchema = z
  .object({
    q: z.string().min(1).max(200),
  })
  .meta({ id: 'SuggestQuery' });
export type SuggestQuery = z.infer<typeof suggestQuerySchema>;

export const suggestProjectHitSchema = z
  .object({
    id: z.string(),
    slug: z.string(),
    title: z.string(),
    designerName: z.string(),
    citySlug: z.string().nullable(),
    coverImageUrl: z.string().nullable(),
  })
  .meta({ id: 'SuggestProjectHit' });
export type SuggestProjectHit = z.infer<typeof suggestProjectHitSchema>;

export const suggestDesignerHitSchema = z
  .object({
    id: z.string(),
    slug: z.string().nullable(),
    displayName: z.string(),
    citySlugs: z.array(z.string()),
    logoUrl: z.string().nullable(),
    projectCount: z.number().int(),
  })
  .meta({ id: 'SuggestDesignerHit' });
export type SuggestDesignerHit = z.infer<typeof suggestDesignerHitSchema>;

export const suggestResponseSchema = z
  .object({
    projects: z.array(suggestProjectHitSchema),
    designers: z.array(suggestDesignerHitSchema),
    processingTimeMs: z.number().int(),
  })
  .meta({ id: 'SuggestResponse' });
export type SuggestResponse = z.infer<typeof suggestResponseSchema>;

// ---------------------------------------------------------------------------
// GET /api/search/designers — designer search
// ---------------------------------------------------------------------------

export const designerSearchQuerySchema = z
  .object({
    q: z.string().max(200).default(''),
    citySlugs: z.array(z.string()).optional(),
    localitySlugs: z.array(z.string()).optional(),
    scopeSlugs: z.array(z.string()).optional(),
    themeSlugs: z.array(z.string()).optional(),
    entityType: z.enum(['individual', 'company']).optional(),
    sort: z.enum(['relevance', 'avgRating:desc', 'projectCount:desc', 'reviewCount:desc', 'yearsExperience:desc']).default('relevance'),
    ...paginationDefaults,
  })
  .refine((data) => data.page * data.limit <= 1000, {
    message: 'Maximum pagination window exceeded',
    path: ['page'],
  })
  .meta({ id: 'DesignerSearchQuery' });
export type DesignerSearchQuery = z.infer<typeof designerSearchQuerySchema>;

export const designerSearchHitSchema = z
  .object({
    id: z.string(),
    slug: z.string().nullable(),
    displayName: z.string(),
    bio: z.string().nullable(),
    entityType: z.enum(['individual', 'company']),
    citySlugs: z.array(z.string()),
    scopeSlugs: z.array(z.string()),
    yearsExperience: z.number().int(),
    projectCount: z.number().int(),
    avgRating: z.number(),
    reviewCount: z.number().int(),
    logoUrl: z.string().nullable(),
  })
  .meta({ id: 'DesignerSearchHit' });
export type DesignerSearchHit = z.infer<typeof designerSearchHitSchema>;

export const designerSearchResponseSchema = z
  .object({
    hits: z.array(designerSearchHitSchema),
    estimatedTotalHits: z.number().int(),
    facetDistribution: z.record(z.string(), z.record(z.string(), z.number())).nullable(),
    processingTimeMs: z.number().int(),
    page: z.number().int(),
    limit: z.number().int(),
  })
  .meta({ id: 'DesignerSearchResponse' });
export type DesignerSearchResponse = z.infer<typeof designerSearchResponseSchema>;
