import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import {
  profileCompletionResponseSchema,
  profileDashboardResponseSchema,
  onboardDesignerSchema,
  onboardDesignerResponseSchema,
  profilePublicResponseSchema,
  profileOwnerResponseSchema,
  currentProfileResponseSchema,
  profileIdParamSchema,
  profileSlugParamSchema,
  updateProfileSchema,
  portfolioResponseSchema,
  updatePortfolioSchema,
  slugAvailabilityResponseSchema,
  slugAvailabilitySchema,
  logoUploadRequestSchema,
  logoUploadUrlResponseSchema,
  logoCommitRequestSchema,
  uploadLogoResponseSchema,
  connectGooglePlaceSchema,
  googleReviewsResponseSchema,
  designerProjectsQuerySchema,
  designerProjectsResponseSchema,
  errorResponseSchema,
} from '@repo/contracts';
import { setActiveOrganization, setActiveTeam } from '@repo/auth';
import type { AuthVariables } from '../../lib/auth-middleware.js';
import { requireAuth } from '../../lib/auth-middleware.js';
import { validationHook } from '../../lib/validation.js';
import { dashboardService } from '../dashboard/service.js';
import { profilesService } from './service.js';
import { portfolioService } from './portfolio-service.js';
import { googleReviewsService } from './google-service.js';
import { projectsService } from '../projects/service.js';
import { orgsService } from '../orgs/service.js';

/**
 * Profiles HTTP routes. Authenticated endpoints for the current user's profile.
 */

const completionRoute = createRoute({
  method: 'get',
  path: '/me/completion',
  tags: ['Profiles'],
  summary: 'Get profile completion checklist and score',
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  responses: {
    200: {
      description: 'Completion checklist with steps, score, and missing items',
      content: { 'application/json': { schema: profileCompletionResponseSchema } },
    },
    401: {
      description: 'Unauthorized',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
    403: {
      description: 'Caller is not a member of the active organization',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
    422: {
      description: 'No active organization selected',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
  },
});

const dashboardRoute = createRoute({
  method: 'get',
  path: '/me/dashboard',
  tags: ['Profiles'],
  summary: 'Get dashboard summary for the active designer organization',
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  responses: {
    200: {
      description: 'Dashboard summary with completion, project counts, lead counts, and share URL',
      content: { 'application/json': { schema: profileDashboardResponseSchema } },
    },
    401: {
      description: 'Unauthorized',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
    403: {
      description: 'No designer profile for the active organization',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
    422: {
      description: 'No active organization selected',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
  },
});

const onboardRoute = createRoute({
  method: 'post',
  path: '/me',
  tags: ['Profiles'],
  summary: 'Designer onboarding — create profile + org in one transaction',
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  request: {
    body: {
      content: { 'application/json': { schema: onboardDesignerSchema } },
    },
  },
  responses: {
    200: {
      description: 'Already onboarded — idempotent return',
      content: { 'application/json': { schema: onboardDesignerResponseSchema } },
    },
    201: {
      description: 'Successfully onboarded',
      content: { 'application/json': { schema: onboardDesignerResponseSchema } },
    },
    401: {
      description: 'Unauthorized or banned',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
    422: {
      description: 'Validation error — invalid taxonomy IDs or missing required fields',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
  },
});

export const profilesRoutes = new OpenAPIHono<{ Variables: AuthVariables }>({ defaultHook: validationHook })
  .openapi(
    createRoute({
      method: 'get',
      path: '/me',
      tags: ['Profiles'],
      summary: 'Get own profile and active organization context',
      security: [{ cookieAuth: [] }],
      middleware: [requireAuth] as const,
      responses: {
        200: {
          description: 'Current organization member profile context',
          content: { 'application/json': { schema: currentProfileResponseSchema } },
        },
        401: {
          description: 'Unauthorized',
          content: { 'application/json': { schema: errorResponseSchema } },
        },
        403: {
          description: 'Forbidden — not a member of the active organization',
          content: { 'application/json': { schema: errorResponseSchema } },
        },
        404: {
          description: 'No profile for the active organization',
          content: { 'application/json': { schema: errorResponseSchema } },
        },
        422: {
          description: 'No active organization selected',
          content: { 'application/json': { schema: errorResponseSchema } },
        },
      },
    }),
    async (c) => {
      const user = c.get('user')!;
      const session = c.get('session');
      const result = await profilesService.getCurrentProfile(
        user.id,
        session?.activeOrganizationId ?? null,
        session?.activeTeamId ?? null,
      );
      return c.json(result, 200);
    },
  )
  .openapi(
    createRoute({
      method: 'get',
      path: '/slug/{slug}',
      tags: ['Profiles'],
      summary: 'Get a public branch profile by slug (active only)',
      request: { params: profileSlugParamSchema },
      responses: {
        200: {
          description: 'Public profile projection',
          content: { 'application/json': { schema: profilePublicResponseSchema } },
        },
        404: {
          description: 'Profile not found or not active',
          content: { 'application/json': { schema: errorResponseSchema } },
        },
      },
    }),
    async (c) => {
      const { slug } = c.req.valid('param');
      const result = await profilesService.getPublicProfileBySlug(slug);
      return c.json(result, 200);
    },
  )
  .openapi(
    createRoute({
      method: 'get',
      path: '/{id}',
      tags: ['Profiles'],
      summary: 'Get a public profile by ID (active only)',
      request: { params: profileIdParamSchema },
      responses: {
        200: {
          description: 'Public profile projection',
          content: { 'application/json': { schema: profilePublicResponseSchema } },
        },
        404: {
          description: 'Profile not found or not active',
          content: { 'application/json': { schema: errorResponseSchema } },
        },
      },
    }),
    async (c) => {
      const { id } = c.req.valid('param');
      const result = await profilesService.getPublicProfile(id);
      return c.json(result, 200);
    },
  )
  .openapi(completionRoute, async (c) => {
    const user = c.get('user')!;
    const session = c.get('session');
    const result = await profilesService.getCompletion({
      userId: user.id,
      orgId: session?.activeOrganizationId ?? null,
      teamId: session?.activeTeamId ?? null,
    });
    return c.json(result, 200);
  })
  .openapi(dashboardRoute, async (c) => {
    const user = c.get('user')!;
    const session = c.get('session');
    const result = await dashboardService.getProfileDashboard({
      userId: user.id,
      orgId: session?.activeOrganizationId ?? null,
      teamId: session?.activeTeamId ?? null,
    });
    return c.json(result, 200);
  })
  .openapi(onboardRoute, async (c) => {
    const user = c.get('user')!;
    const input = c.req.valid('json');
    const { data, created, activeTeamId } = await profilesService.onboardDesigner(user.id, input);
    const activeOrganizationResponse = await setActiveOrganization(
      c.req.raw.headers,
      data.organization.id,
    );
    if (!activeOrganizationResponse.ok) {
      throw new Error('Failed to activate the organization after onboarding');
    }
    for (const cookie of activeOrganizationResponse.headers.getSetCookie()) {
      c.header('Set-Cookie', cookie, { append: true });
    }
    const activeTeamResponse = await setActiveTeam(c.req.raw.headers, activeTeamId);
    if (!activeTeamResponse.ok) {
      throw new Error('Failed to activate the branch after onboarding');
    }
    for (const cookie of activeTeamResponse.headers.getSetCookie()) {
      c.header('Set-Cookie', cookie, { append: true });
    }
    await orgsService.saveContextPreference(user.id, {
      kind: 'organization',
      organizationId: data.organization.id,
      teamId: activeTeamId,
    });
    return c.json(data, created ? 201 : 200);
  })
  .openapi(
    createRoute({
      method: 'patch',
      path: '/me',
      tags: ['Profiles'],
      summary: 'Update own profile (org writer role required)',
      security: [{ cookieAuth: [] }],
      middleware: [requireAuth] as const,
      request: {
        body: {
          content: { 'application/json': { schema: updateProfileSchema } },
        },
      },
      responses: {
        200: {
          description: 'Updated profile (owner projection)',
          content: { 'application/json': { schema: profileOwnerResponseSchema } },
        },
        401: {
          description: 'Unauthorized',
          content: { 'application/json': { schema: errorResponseSchema } },
        },
        403: {
          description: 'Forbidden — not a writer in the active organization',
          content: { 'application/json': { schema: errorResponseSchema } },
        },
        404: {
          description: 'No profile for the active organization',
          content: { 'application/json': { schema: errorResponseSchema } },
        },
        422: {
          description: 'No active organization or invalid taxonomy IDs',
          content: { 'application/json': { schema: errorResponseSchema } },
        },
      },
    }),
    async (c) => {
      const user = c.get('user')!;
      const session = c.get('session');
      const input = c.req.valid('json');
      const result = await profilesService.updateProfile(
        user.id,
        session?.activeOrganizationId ?? null,
        input,
        session?.activeTeamId ?? null,
      );
      return c.json(result, 200);
    },
  )
  .openapi(
    createRoute({
      method: 'get',
      path: '/me/portfolio',
      tags: ['Portfolio'],
      summary: 'Get portfolio settings for the active designer',
      security: [{ cookieAuth: [] }],
      middleware: [requireAuth] as const,
      responses: {
        200: {
          description: 'Portfolio settings with merged profile data and badges',
          content: { 'application/json': { schema: portfolioResponseSchema } },
        },
        401: { description: 'Unauthorized', content: { 'application/json': { schema: errorResponseSchema } } },
        403: { description: 'Forbidden', content: { 'application/json': { schema: errorResponseSchema } } },
        404: { description: 'No profile found', content: { 'application/json': { schema: errorResponseSchema } } },
        422: { description: 'No active organization', content: { 'application/json': { schema: errorResponseSchema } } },
      },
    }),
    async (c) => {
      const user = c.get('user')!;
      const session = c.get('session');
      const result = await portfolioService.getPortfolio({
        userId: user.id,
        activeOrgId: session?.activeOrganizationId ?? null,
        activeTeamId: session?.activeTeamId ?? null,
      });
      return c.json(result, 200);
    },
  )
  .openapi(
    createRoute({
      method: 'patch',
      path: '/me/portfolio',
      tags: ['Portfolio'],
      summary: 'Update portfolio settings',
      security: [{ cookieAuth: [] }],
      middleware: [requireAuth] as const,
      request: {
        body: {
          content: { 'application/json': { schema: updatePortfolioSchema } },
        },
      },
      responses: {
        200: {
          description: 'Updated portfolio settings',
          content: { 'application/json': { schema: portfolioResponseSchema } },
        },
        401: { description: 'Unauthorized', content: { 'application/json': { schema: errorResponseSchema } } },
        403: { description: 'Forbidden', content: { 'application/json': { schema: errorResponseSchema } } },
        404: { description: 'No profile found', content: { 'application/json': { schema: errorResponseSchema } } },
        409: { description: 'Slug conflict', content: { 'application/json': { schema: errorResponseSchema } } },
        422: { description: 'Validation error', content: { 'application/json': { schema: errorResponseSchema } } },
      },
    }),
    async (c) => {
      const user = c.get('user')!;
      const session = c.get('session');
      const input = c.req.valid('json');
      const result = await portfolioService.updatePortfolio(input, {
        userId: user.id,
        activeOrgId: session?.activeOrganizationId ?? null,
        activeTeamId: session?.activeTeamId ?? null,
      });
      return c.json(result, 200);
    },
  )
  .openapi(
    createRoute({
      method: 'post',
      path: '/me/portfolio/slug-check',
      tags: ['Portfolio'],
      summary: 'Check if a portfolio slug is available',
      security: [{ cookieAuth: [] }],
      middleware: [requireAuth] as const,
      request: {
        body: {
          content: { 'application/json': { schema: slugAvailabilitySchema } },
        },
      },
      responses: {
        200: {
          description: 'Slug availability result',
          content: { 'application/json': { schema: slugAvailabilityResponseSchema } },
        },
        401: { description: 'Unauthorized', content: { 'application/json': { schema: errorResponseSchema } } },
        403: { description: 'Forbidden', content: { 'application/json': { schema: errorResponseSchema } } },
        422: { description: 'Validation error', content: { 'application/json': { schema: errorResponseSchema } } },
      },
    }),
    async (c) => {
      const user = c.get('user')!;
      const session = c.get('session');
      const { slug } = c.req.valid('json');
      const result = await portfolioService.checkSlugAvailability(slug, {
        userId: user.id,
        activeOrgId: session?.activeOrganizationId ?? null,
        activeTeamId: session?.activeTeamId ?? null,
      });
      return c.json(result, 200);
    },
  )
  .openapi(
    createRoute({
      method: 'post',
      path: '/me/portfolio/logo/upload',
      tags: ['Portfolio'],
      summary: 'Get a presigned upload URL for the portfolio logo',
      security: [{ cookieAuth: [] }],
      middleware: [requireAuth] as const,
      request: {
        body: {
          content: { 'application/json': { schema: logoUploadRequestSchema } },
        },
      },
      responses: {
        201: {
          description: 'Presigned upload URL and object key',
          content: { 'application/json': { schema: logoUploadUrlResponseSchema } },
        },
        401: { description: 'Unauthorized', content: { 'application/json': { schema: errorResponseSchema } } },
        403: { description: 'Forbidden', content: { 'application/json': { schema: errorResponseSchema } } },
        422: { description: 'Validation error', content: { 'application/json': { schema: errorResponseSchema } } },
      },
    }),
    async (c) => {
      const user = c.get('user')!;
      const session = c.get('session');
      const input = c.req.valid('json');
      const result = await portfolioService.createLogoUploadUrl(input, {
        userId: user.id,
        activeOrgId: session?.activeOrganizationId ?? null,
        activeTeamId: session?.activeTeamId ?? null,
      });
      return c.json(result, 201);
    },
  )
  .openapi(
    createRoute({
      method: 'post',
      path: '/me/portfolio/logo/commit',
      tags: ['Portfolio'],
      summary: 'Commit an uploaded logo and persist the association',
      security: [{ cookieAuth: [] }],
      middleware: [requireAuth] as const,
      request: {
        body: {
          content: { 'application/json': { schema: logoCommitRequestSchema } },
        },
      },
      responses: {
        200: {
          description: 'Logo committed successfully with public URL',
          content: { 'application/json': { schema: uploadLogoResponseSchema } },
        },
        400: { description: 'No uploaded object found in storage', content: { 'application/json': { schema: errorResponseSchema } } },
        401: { description: 'Unauthorized', content: { 'application/json': { schema: errorResponseSchema } } },
        403: { description: 'Forbidden', content: { 'application/json': { schema: errorResponseSchema } } },
        409: { description: 'Logo was modified concurrently', content: { 'application/json': { schema: errorResponseSchema } } },
        422: { description: 'Validation error', content: { 'application/json': { schema: errorResponseSchema } } },
      },
    }),
    async (c) => {
      const user = c.get('user')!;
      const session = c.get('session');
      const { objectKey } = c.req.valid('json');
      const result = await portfolioService.commitLogoUpload({ objectKey }, {
        userId: user.id,
        activeOrgId: session?.activeOrganizationId ?? null,
        activeTeamId: session?.activeTeamId ?? null,
      });
      return c.json(result, 200);
    },
  )
  .openapi(
    createRoute({
      method: 'delete',
      path: '/me/portfolio/logo',
      tags: ['Portfolio'],
      summary: 'Delete the portfolio logo',
      security: [{ cookieAuth: [] }],
      middleware: [requireAuth] as const,
      responses: {
        204: {
          description: 'Logo deleted successfully',
        },
        401: { description: 'Unauthorized', content: { 'application/json': { schema: errorResponseSchema } } },
        403: { description: 'Forbidden', content: { 'application/json': { schema: errorResponseSchema } } },
        404: { description: 'No logo exists to delete', content: { 'application/json': { schema: errorResponseSchema } } },
      },
    }),
    async (c) => {
      const user = c.get('user')!;
      const session = c.get('session');
      await portfolioService.deleteLogo({
        userId: user.id,
        activeOrgId: session?.activeOrganizationId ?? null,
        activeTeamId: session?.activeTeamId ?? null,
      });
      return c.body(null, 204);
    },
  )
  // --- Google reviews (portfolio Google Business integration) ---
  .openapi(
    createRoute({
      method: 'get',
      path: '/me/portfolio/google',
      tags: ['Portfolio'],
      summary: 'Get the Google review connection + cached reviews',
      security: [{ cookieAuth: [] }],
      middleware: [requireAuth] as const,
      responses: {
        200: {
          description: 'Connection state, availability, and cached reviews',
          content: { 'application/json': { schema: googleReviewsResponseSchema } },
        },
        401: { description: 'Unauthorized', content: { 'application/json': { schema: errorResponseSchema } } },
        403: { description: 'Forbidden', content: { 'application/json': { schema: errorResponseSchema } } },
        404: { description: 'No profile found', content: { 'application/json': { schema: errorResponseSchema } } },
        422: { description: 'No active organization', content: { 'application/json': { schema: errorResponseSchema } } },
      },
    }),
    async (c) => {
      const user = c.get('user')!;
      const session = c.get('session');
      const result = await googleReviewsService.get({
        userId: user.id,
        activeOrgId: session?.activeOrganizationId ?? null,
        activeTeamId: session?.activeTeamId ?? null,
      });
      return c.json(result, 200);
    },
  )
  .openapi(
    createRoute({
      method: 'post',
      path: '/me/portfolio/google/connect',
      tags: ['Portfolio'],
      summary: 'Connect a Google Business location and fetch its reviews',
      security: [{ cookieAuth: [] }],
      middleware: [requireAuth] as const,
      request: {
        body: { content: { 'application/json': { schema: connectGooglePlaceSchema } } },
      },
      responses: {
        200: {
          description: 'Connection stored (pending first fetch)',
          content: { 'application/json': { schema: googleReviewsResponseSchema } },
        },
        400: { description: 'Invalid Google Business reference', content: { 'application/json': { schema: errorResponseSchema } } },
        401: { description: 'Unauthorized', content: { 'application/json': { schema: errorResponseSchema } } },
        403: { description: 'Forbidden', content: { 'application/json': { schema: errorResponseSchema } } },
        404: { description: 'No profile found', content: { 'application/json': { schema: errorResponseSchema } } },
        422: { description: 'Feature unavailable or location not found', content: { 'application/json': { schema: errorResponseSchema } } },
      },
    }),
    async (c) => {
      const user = c.get('user')!;
      const session = c.get('session');
      const input = c.req.valid('json');
      const result = await googleReviewsService.connect(input, {
        userId: user.id,
        activeOrgId: session?.activeOrganizationId ?? null,
        activeTeamId: session?.activeTeamId ?? null,
      });
      return c.json(result, 200);
    },
  )
  .openapi(
    createRoute({
      method: 'post',
      path: '/me/portfolio/google/refresh',
      tags: ['Portfolio'],
      summary: 'Re-fetch the connected Google location in the background',
      security: [{ cookieAuth: [] }],
      middleware: [requireAuth] as const,
      responses: {
        202: {
          description: 'Refresh enqueued; returns the current cached state',
          content: { 'application/json': { schema: googleReviewsResponseSchema } },
        },
        401: { description: 'Unauthorized', content: { 'application/json': { schema: errorResponseSchema } } },
        403: { description: 'Forbidden', content: { 'application/json': { schema: errorResponseSchema } } },
        404: { description: 'No Google location connected', content: { 'application/json': { schema: errorResponseSchema } } },
      },
    }),
    async (c) => {
      const user = c.get('user')!;
      const session = c.get('session');
      const result = await googleReviewsService.refresh({
        userId: user.id,
        activeOrgId: session?.activeOrganizationId ?? null,
        activeTeamId: session?.activeTeamId ?? null,
      });
      return c.json(result, 202);
    },
  )
  .openapi(
    createRoute({
      method: 'delete',
      path: '/me/portfolio/google',
      tags: ['Portfolio'],
      summary: 'Disconnect the Google Business location',
      security: [{ cookieAuth: [] }],
      middleware: [requireAuth] as const,
      responses: {
        204: { description: 'Disconnected' },
        401: { description: 'Unauthorized', content: { 'application/json': { schema: errorResponseSchema } } },
        403: { description: 'Forbidden', content: { 'application/json': { schema: errorResponseSchema } } },
        404: { description: 'No profile found', content: { 'application/json': { schema: errorResponseSchema } } },
      },
    }),
    async (c) => {
      const user = c.get('user')!;
      const session = c.get('session');
      await googleReviewsService.disconnect({
        userId: user.id,
        activeOrgId: session?.activeOrganizationId ?? null,
        activeTeamId: session?.activeTeamId ?? null,
      });
      return c.body(null, 204);
    },
  )
  // --- Public read endpoints (E-195) ---
  .openapi(
    createRoute({
      method: 'get',
      path: '/{id}/projects',
      tags: ['Profiles'],
      summary: 'Published projects for a designer profile (public, paginated)',
      request: {
        params: profileIdParamSchema,
        query: designerProjectsQuerySchema,
      },
      responses: {
        200: {
          description: 'Paginated published projects (feed card projection)',
          content: { 'application/json': { schema: designerProjectsResponseSchema } },
        },
        404: {
          description: 'Designer profile not found or inactive',
          content: { 'application/json': { schema: errorResponseSchema } },
        },
      },
    }),
    async (c) => {
      const { id } = c.req.valid('param');
      const query = c.req.valid('query');
      const result = await projectsService.designerProjects(id, query);
      c.header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
      return c.json(result, 200);
    },
  );

export type ProfilesRoutes = typeof profilesRoutes;
