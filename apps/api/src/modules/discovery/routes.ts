import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import {
  projectIdParamSchema,
  similarProjectsResponseSchema,
  errorResponseSchema,
} from '@repo/contracts';
import { validationHook } from '../../lib/validation.js';
import { projectsService } from '../projects/service.js';

/**
 * Discovery routes (E-195). Thin routing layer — business logic lives in
 * the projects service. Exposed at /api/discovery per the issue spec.
 */

export const discoveryRoutes = new OpenAPIHono({ defaultHook: validationHook })
  .openapi(
    createRoute({
      method: 'get',
      path: '/similar/{id}',
      tags: ['Discovery'],
      summary: 'Similar published projects (same city + bhk + budget band + scope)',
      request: { params: projectIdParamSchema },
      responses: {
        200: {
          description: 'Up to 8 similar published projects',
          content: { 'application/json': { schema: similarProjectsResponseSchema } },
        },
        404: {
          description: 'Source project not found or not published',
          content: { 'application/json': { schema: errorResponseSchema } },
        },
      },
    }),
    async (c) => {
      const { id } = c.req.valid('param');
      const result = await projectsService.similarProjects(id);
      c.header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
      return c.json(result, 200);
    },
  );
