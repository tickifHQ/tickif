import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import {
  errorResponseSchema,
  portfolioSlugParamSchema,
  publicPortfolioResponseSchema,
} from '@repo/contracts';
import { validationHook } from '../../lib/validation.js';
import { publicPortfolioService } from './public-portfolio-service.js';

/**
 * Public portfolio routes — anonymous reads for the `/d/{slug}` page.
 *
 * Kept in their own router (mounted at `/api/portfolios`) rather than bolted
 * onto `profilesRoutes`: the profiles router is keyed on profile UUIDs and
 * `/me`, while a public portfolio is addressed by slug. Separating them also
 * keeps every authenticated route in one file and every anonymous one here.
 */
export const publicPortfolioRoutes = new OpenAPIHono({ defaultHook: validationHook }).openapi(
  createRoute({
    method: 'get',
    path: '/{slug}',
    tags: ['Portfolio'],
    summary: 'Public designer portfolio by slug (published portfolios only)',
    request: { params: portfolioSlugParamSchema },
    responses: {
      200: {
        description: 'Public portfolio payload for the designer profile page',
        content: { 'application/json': { schema: publicPortfolioResponseSchema } },
      },
      404: {
        description: 'No active designer has a published portfolio at this slug',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      422: {
        description: 'Slug is not URL-safe',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
    },
  }),
  async (c) => {
    const { slug } = c.req.valid('param');
    const result = await publicPortfolioService.getBySlug(slug);
    // Public and cacheable: a portfolio edit becoming visible within a minute is
    // an acceptable trade for shielding the DB from share-link traffic spikes.
    c.header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    return c.json(result, 200);
  },
);

export type PublicPortfolioRoutes = typeof publicPortfolioRoutes;
