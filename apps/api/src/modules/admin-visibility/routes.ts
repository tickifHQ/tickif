import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import {
  adminCompanySearchQuerySchema,
  adminCompanySearchResponseSchema,
  adminEntityQuerySchema,
  adminEntityResponseSchema,
  adminLeadDetailSchema,
  adminLeadIdSchema,
  adminLeadQuerySchema,
  adminLeadResponseSchema,
  adminReportQuerySchema,
  adminReportResponseSchema,
  adminThreadQuerySchema,
  errorResponseSchema,
} from '@repo/contracts';
import type { AuthVariables } from '../../lib/auth-middleware.js';
import { requireAnyRole, requireAuth } from '../../lib/auth-middleware.js';
import { validationHook } from '../../lib/validation.js';
import { adminVisibilityService as service } from './service.js';

const common = {
  tags: ['Admin visibility'],
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth, requireAnyRole(['admin'])],
};
const errors = {
  422: {
    description: 'Invalid filters or pagination',
    content: { 'application/json': { schema: errorResponseSchema } },
  },
  401: {
    description: 'Authentication required',
    content: { 'application/json': { schema: errorResponseSchema } },
  },
  403: {
    description: 'Platform admin role required',
    content: { 'application/json': { schema: errorResponseSchema } },
  },
  404: {
    description: 'Company, designer or lead not found',
    content: { 'application/json': { schema: errorResponseSchema } },
  },
};
const companies = createRoute({
  ...common,
  method: 'get',
  path: '/companies',
  summary: 'Search companies for admin filters',
  request: { query: adminCompanySearchQuerySchema },
  responses: {
    ...errors,
    200: {
      description: 'Companies',
      content: { 'application/json': { schema: adminCompanySearchResponseSchema } },
    },
  },
});
const leads = createRoute({
  ...common,
  method: 'get',
  path: '/leads',
  summary: 'List platform leads and pipeline by date and company',
  request: { query: adminLeadQuerySchema },
  responses: {
    ...errors,
    200: {
      description: 'Leads',
      content: { 'application/json': { schema: adminLeadResponseSchema } },
    },
  },
});
const lead = createRoute({
  ...common,
  method: 'get',
  path: '/leads/{id}',
  summary: 'Read full lead details and paginated studio messages without changing milestones',
  request: { params: adminLeadIdSchema, query: adminThreadQuerySchema },
  responses: {
    ...errors,
    200: {
      description: 'Lead details',
      content: { 'application/json': { schema: adminLeadDetailSchema } },
    },
  },
});
const entities = createRoute({
  ...common,
  method: 'get',
  path: '/entities',
  summary: 'Compare company or designer performance',
  request: { query: adminEntityQuerySchema },
  responses: {
    ...errors,
    200: {
      description: 'Company or designer analytics',
      content: { 'application/json': { schema: adminEntityResponseSchema } },
    },
  },
});
const report = createRoute({
  ...common,
  method: 'get',
  path: '/report',
  summary: 'Report enquiry response and pipeline progression for a submission cohort',
  request: { query: adminReportQuerySchema },
  responses: {
    ...errors,
    200: {
      description: 'Report',
      content: { 'application/json': { schema: adminReportResponseSchema } },
    },
  },
});

export const adminVisibilityRoutes = new OpenAPIHono<{ Variables: AuthVariables }>({
  defaultHook: validationHook,
})
  .openapi(companies, async (c) => {
    c.header('Cache-Control', 'private, no-store');
    return c.json(await service.companies(c.req.valid('query')), 200);
  })
  .openapi(leads, async (c) => {
    c.header('Cache-Control', 'private, no-store');
    return c.json(await service.leads(c.req.valid('query')), 200);
  })
  .openapi(lead, async (c) => {
    c.header('Cache-Control', 'private, no-store');
    return c.json(await service.lead(c.req.valid('param').id, c.req.valid('query')), 200);
  })
  .openapi(entities, async (c) => {
    c.header('Cache-Control', 'private, no-store');
    return c.json(await service.entities(c.req.valid('query')), 200);
  })
  .openapi(report, async (c) => {
    c.header('Cache-Control', 'private, no-store');
    return c.json(await service.report(c.req.valid('query')), 200);
  });
