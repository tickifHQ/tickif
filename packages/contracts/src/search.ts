import { z } from 'zod';

/**
 * Shared contracts for the `search` slice — the single source of truth for
 * request/response shapes for project search, designer search, and blended suggest.
 * Used by both the Hono API (validation + OpenAPI) and the Next.js web app (typed fetch).
 * Plain zod, no framework deps.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Multi-value facet: single string or array of strings for OR logic within facet */
const multiValueFacet = z.union([z.string(), z.array(z.string())]);

// ─────────────────────────────────────────────────────────────────────────────
// Project Search
// ─────────────────────────────────────────────────────────────────────────────

export const projectSortOption = z
  .enum(['relevance', 'publishedAt:desc', 'publishedAt:asc', 'sizeSqft:asc', 'sizeSqft:desc'])
  .meta({ id: 'ProjectSortOption' });
export type ProjectSortOption = z.infer<typeof projectSortOption>;

export const searchProjectsQuerySchema = z
  .object({
    q: z.string().max(200).default(''),
    citySlug: multiValueFacet.optional(),
    localitySlug: multiValueFacet.optional(),
    propertyTypeSlug: multiValueFacet.optional(),
    propertySubtypeSlug: multiValueFacet.optional(),
    scopeSlug: multiValueFacet.optional(),
    bhkSlug: multiValueFacet.optional(),
    budgetBandSlug: multiValueFacet.optional(),
    themes: multiValueFacet.optional(),
    materials: multiValueFacet.optional(),
    finishes: multiValueFacet.optional(),
    roomSlugs: multiValueFacet.optional(),
    sort: projectSortOption.default('relevance'),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(48).default(24),
  })
  .refine((data) => data.page * data.limit <= 1000, {
    message: 'Maximum pagination window exceeded',
    path: ['page'],
  })
  .meta({ id: 'SearchProjectsQuery' });
export type SearchProjectsQuery = z.infer<typeof searchProjectsQuerySchema>;

export const projectHitSchema = z
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
    propertySubtypeSlug: z.string().nullable(),
    scopeSlug: z.string().nullable(),
    bhkSlug: z.string().nullable(),
    budgetBandSlug: z.string().nullable(),
    sizeSqft: z.number().nullable(),
    themes: z.array(z.string()),
    materials: z.array(z.string()),
    finishes: z.array(z.string()),
    roomSlugs: z.array(z.string()),
    coverImageUrl: z.string().nullable(),
    publishedAt: z.number(), // Unix ms
  })
  .meta({ id: 'ProjectHit' });
export type ProjectHit = z.infer<typeof projectHitSchema>;

export const projectSearchFallback = z
  .enum(['none', 'relaxed', 'recent_in_city'])
  .meta({ id: 'ProjectSearchFallback' });
export type ProjectSearchFallback = z.infer<typeof projectSearchFallback>;

export const searchProjectsResponseSchema = z
  .object({
    hits: z.array(projectHitSchema),
    estimatedTotalHits: z.number(),
    facetDistribution: z.record(z.string(), z.record(z.string(), z.number())),
    processingTimeMs: z.number(),
    page: z.number(),
    limit: z.number(),
    fallback: projectSearchFallback,
    relaxedFilters: z.array(z.string()),
  })
  .meta({ id: 'SearchProjectsResponse' });
export type SearchProjectsResponse = z.infer<typeof searchProjectsResponseSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Designer Search
// ─────────────────────────────────────────────────────────────────────────────

export const designerSortOption = z
  .enum(['relevance', 'avgRating:desc', 'projectCount:desc', 'reviewCount:desc', 'yearsExperience:desc'])
  .meta({ id: 'DesignerSortOption' });
export type DesignerSortOption = z.infer<typeof designerSortOption>;

export const designerEntityType = z
  .enum(['individual', 'company'])
  .meta({ id: 'DesignerEntityType' });
export type DesignerEntityType = z.infer<typeof designerEntityType>;

export const searchDesignersQuerySchema = z
  .object({
    q: z.string().max(200).default(''),
    citySlugs: multiValueFacet.optional(),
    localitySlugs: multiValueFacet.optional(),
    scopeSlugs: multiValueFacet.optional(),
    themeSlugs: multiValueFacet.optional(),
    entityType: designerEntityType.optional(),
    sort: designerSortOption.default('relevance'),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(48).default(24),
  })
  .refine((data) => data.page * data.limit <= 1000, {
    message: 'Maximum pagination window exceeded',
    path: ['page'],
  })
  .meta({ id: 'SearchDesignersQuery' });
export type SearchDesignersQuery = z.infer<typeof searchDesignersQuerySchema>;

export const designerHitSchema = z
  .object({
    id: z.string(),
    slug: z.string().nullable(),
    displayName: z.string(),
    bio: z.string().nullable(),
    entityType: designerEntityType,
    citySlugs: z.array(z.string()),
    localitySlugs: z.array(z.string()),
    scopeSlugs: z.array(z.string()),
    themeSlugs: z.array(z.string()),
    yearsExperience: z.number(),
    projectCount: z.number(),
    avgRating: z.number(),
    reviewCount: z.number(),
    logoUrl: z.string().nullable(),
  })
  .meta({ id: 'DesignerHit' });
export type DesignerHit = z.infer<typeof designerHitSchema>;

export const searchDesignersResponseSchema = z
  .object({
    hits: z.array(designerHitSchema),
    estimatedTotalHits: z.number(),
    facetDistribution: z.record(z.string(), z.record(z.string(), z.number())),
    processingTimeMs: z.number(),
    page: z.number(),
    limit: z.number(),
  })
  .meta({ id: 'SearchDesignersResponse' });
export type SearchDesignersResponse = z.infer<typeof searchDesignersResponseSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Blended Suggest
// ─────────────────────────────────────────────────────────────────────────────

export const searchSuggestQuerySchema = z
  .object({
    q: z.string().min(1).max(200),
  })
  .meta({ id: 'SearchSuggestQuery' });
export type SearchSuggestQuery = z.infer<typeof searchSuggestQuerySchema>;

export const suggestProjectSchema = z
  .object({
    id: z.string(),
    slug: z.string(),
    title: z.string(),
    designerName: z.string(),
    citySlug: z.string().nullable(),
    coverImageUrl: z.string().nullable(),
  })
  .meta({ id: 'SuggestProject' });
export type SuggestProject = z.infer<typeof suggestProjectSchema>;

export const suggestDesignerSchema = z
  .object({
    id: z.string(),
    slug: z.string().nullable(),
    displayName: z.string(),
    citySlugs: z.array(z.string()),
    logoUrl: z.string().nullable(),
    projectCount: z.number(),
  })
  .meta({ id: 'SuggestDesigner' });
export type SuggestDesigner = z.infer<typeof suggestDesignerSchema>;

export const searchSuggestResponseSchema = z
  .object({
    projects: z.array(suggestProjectSchema),
    designers: z.array(suggestDesignerSchema),
    processingTimeMs: z.number(),
  })
  .meta({ id: 'SearchSuggestResponse' });
export type SearchSuggestResponse = z.infer<typeof searchSuggestResponseSchema>;
