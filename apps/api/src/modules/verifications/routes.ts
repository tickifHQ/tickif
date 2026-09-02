import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import {
  ADMIN_PLATFORM_ROLES,
  PLATFORM_ROLE,
  adminVerificationDetailResponseSchema,
  adminVerificationQueueQuerySchema,
  adminVerificationQueueResponseSchema,
  errorResponseSchema,
  rejectVerificationSchema,
  verificationApplicationIdParamSchema,
  verificationDocumentDownloadResponseSchema,
  verificationDocumentUploadResponseSchema,
  verificationDocumentUploadSchema,
  verificationDocumentVersionParamSchema,
  verificationStateResponseSchema,
} from '@repo/contracts';
import { requireAnyRole, requireAuth, type AuthVariables } from '../../lib/auth-middleware.js';
import { AppError } from '../../lib/errors.js';
import { validationHook } from '../../lib/validation.js';
import { verificationsService } from './service.js';

const designerMiddleware = [requireAuth, requireAnyRole([PLATFORM_ROLE.DESIGNER])];
const adminMiddleware = [requireAuth, requireAnyRole(ADMIN_PLATFORM_ROLES)];

const errorJson = (description: string) => ({
  description,
  content: { 'application/json': { schema: errorResponseSchema } },
});

function designerCaller(c: {
  get(key: 'user'): AuthVariables['user'];
  get(key: 'session'): AuthVariables['session'];
}) {
  const user = c.get('user');
  if (!user) throw AppError.unauthorized();
  return {
    userId: user.id,
    activeOrgId: c.get('session')?.activeOrganizationId ?? null,
  };
}

function adminId(user: AuthVariables['user']): string {
  if (!user) throw AppError.unauthorized();
  return user.id;
}

const getStateRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['Verification'],
  summary: 'Get verification state and eligibility for the active organization',
  security: [{ cookieAuth: [] }],
  middleware: designerMiddleware,
  responses: {
    200: {
      description: 'Verification state',
      content: { 'application/json': { schema: verificationStateResponseSchema } },
    },
    401: errorJson('Unauthorized'),
    403: errorJson('Designer organization access required'),
    422: errorJson('An active organization and designer profile are required'),
  },
});

const uploadRoute = createRoute({
  method: 'post',
  path: '/documents/upload-url',
  tags: ['Verification'],
  summary: 'Reserve a private verification document version and mint its upload URL',
  security: [{ cookieAuth: [] }],
  middleware: designerMiddleware,
  request: {
    body: { content: { 'application/json': { schema: verificationDocumentUploadSchema } } },
  },
  responses: {
    201: {
      description: 'Private upload URL',
      content: { 'application/json': { schema: verificationDocumentUploadResponseSchema } },
    },
    401: errorJson('Unauthorized'),
    403: errorJson('Organization owner or admin access required'),
    409: errorJson('Verification is not editable'),
    422: errorJson('Document metadata is invalid'),
  },
});

const commitRoute = createRoute({
  method: 'post',
  path: '/documents/{versionId}/commit',
  tags: ['Verification'],
  summary: 'Commit an uploaded private verification document',
  security: [{ cookieAuth: [] }],
  middleware: designerMiddleware,
  request: { params: verificationDocumentVersionParamSchema },
  responses: {
    200: {
      description: 'Updated verification state',
      content: { 'application/json': { schema: verificationStateResponseSchema } },
    },
    401: errorJson('Unauthorized'),
    403: errorJson('Organization owner or admin access required'),
    404: errorJson('Document not found'),
    409: errorJson('Document state changed'),
    422: errorJson('Document upload is missing'),
  },
});

const removeDocumentRoute = createRoute({
  method: 'delete',
  path: '/documents/{versionId}',
  tags: ['Verification'],
  summary: 'Cancel or remove a private verification document',
  security: [{ cookieAuth: [] }],
  middleware: designerMiddleware,
  request: { params: verificationDocumentVersionParamSchema },
  responses: {
    200: {
      description: 'Updated verification state',
      content: { 'application/json': { schema: verificationStateResponseSchema } },
    },
    401: errorJson('Unauthorized'),
    403: errorJson('Organization owner or admin access required'),
    404: errorJson('Document not found'),
    409: errorJson('Document state changed'),
    422: errorJson('Active organization, onboarding, or verification state could not be resolved'),
  },
});

const submitRoute = createRoute({
  method: 'post',
  path: '/submit',
  tags: ['Verification'],
  summary: 'Submit or resubmit verification for manual review',
  security: [{ cookieAuth: [] }],
  middleware: designerMiddleware,
  responses: {
    200: {
      description: 'Submitted verification state',
      content: { 'application/json': { schema: verificationStateResponseSchema } },
    },
    401: errorJson('Unauthorized'),
    403: errorJson('Organization owner or admin access required'),
    404: errorJson('Verification application not found'),
    409: errorJson('Verification state changed'),
    422: errorJson('Eligibility requirements are not met'),
  },
});

export const verificationsRoutes = new OpenAPIHono<{ Variables: AuthVariables }>({
  defaultHook: validationHook,
})
  .openapi(getStateRoute, async (c) =>
    c.json(await verificationsService.getState(designerCaller(c)), 200),
  )
  .openapi(uploadRoute, async (c) =>
    c.json(await verificationsService.createUpload(designerCaller(c), c.req.valid('json')), 201),
  )
  .openapi(commitRoute, async (c) =>
    c.json(
      await verificationsService.commitUpload(designerCaller(c), c.req.valid('param').versionId),
      200,
    ),
  )
  .openapi(removeDocumentRoute, async (c) =>
    c.json(
      await verificationsService.removeDocument(designerCaller(c), c.req.valid('param').versionId),
      200,
    ),
  )
  .openapi(submitRoute, async (c) =>
    c.json(await verificationsService.submit(designerCaller(c)), 200),
  );

const listAdminRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['Admin Verification'],
  summary: 'List verification applications by review lifecycle tab',
  security: [{ cookieAuth: [] }],
  middleware: adminMiddleware,
  request: { query: adminVerificationQueueQuerySchema },
  responses: {
    200: {
      description: 'Filtered verification review queue',
      content: { 'application/json': { schema: adminVerificationQueueResponseSchema } },
    },
    401: errorJson('Unauthorized'),
    403: errorJson('Admin role required'),
  },
});

const getAdminRoute = createRoute({
  method: 'get',
  path: '/{id}',
  tags: ['Admin Verification'],
  summary: 'Get verification detail and immutable review history',
  security: [{ cookieAuth: [] }],
  middleware: adminMiddleware,
  request: { params: verificationApplicationIdParamSchema },
  responses: {
    200: {
      description: 'Verification detail',
      content: { 'application/json': { schema: adminVerificationDetailResponseSchema } },
    },
    401: errorJson('Unauthorized'),
    403: errorJson('Admin role required'),
    404: errorJson('Verification application not found'),
  },
});

const downloadAdminRoute = createRoute({
  method: 'get',
  path: '/{id}/documents/{versionId}/download',
  tags: ['Admin Verification'],
  summary: 'Mint a short-lived private verification document download URL',
  security: [{ cookieAuth: [] }],
  middleware: adminMiddleware,
  request: {
    params: verificationApplicationIdParamSchema.extend(
      verificationDocumentVersionParamSchema.shape,
    ),
  },
  responses: {
    200: {
      description: 'Private download URL',
      content: { 'application/json': { schema: verificationDocumentDownloadResponseSchema } },
    },
    401: errorJson('Unauthorized'),
    403: errorJson('Admin role required'),
    404: errorJson('Verification document not found'),
  },
});

const approveAdminRoute = createRoute({
  method: 'post',
  path: '/{id}/approve',
  tags: ['Admin Verification'],
  summary: 'Approve a pending verification application',
  security: [{ cookieAuth: [] }],
  middleware: adminMiddleware,
  request: { params: verificationApplicationIdParamSchema },
  responses: {
    200: {
      description: 'Approved verification detail',
      content: { 'application/json': { schema: adminVerificationDetailResponseSchema } },
    },
    401: errorJson('Unauthorized'),
    403: errorJson('Admin role required'),
    404: errorJson('Verification application not found'),
    409: errorJson('Verification state changed'),
    422: errorJson('Reviewable documents and current eligibility are required'),
  },
});

const rejectAdminRoute = createRoute({
  method: 'post',
  path: '/{id}/reject',
  tags: ['Admin Verification'],
  summary: 'Request verification changes with a user-visible note',
  security: [{ cookieAuth: [] }],
  middleware: adminMiddleware,
  request: {
    params: verificationApplicationIdParamSchema,
    body: { content: { 'application/json': { schema: rejectVerificationSchema } } },
  },
  responses: {
    200: {
      description: 'Rejected verification detail',
      content: { 'application/json': { schema: adminVerificationDetailResponseSchema } },
    },
    401: errorJson('Unauthorized'),
    403: errorJson('Admin role required'),
    404: errorJson('Verification application not found'),
    409: errorJson('Verification state changed'),
    422: errorJson('A note and valid document selection are required'),
  },
});

export const adminVerificationsRoutes = new OpenAPIHono<{ Variables: AuthVariables }>({
  defaultHook: validationHook,
})
  .openapi(listAdminRoute, async (c) =>
    c.json(await verificationsService.listAdmin(c.req.valid('query')), 200),
  )
  .openapi(getAdminRoute, async (c) =>
    c.json(await verificationsService.getAdminDetail(c.req.valid('param').id), 200),
  )
  .openapi(downloadAdminRoute, async (c) => {
    const params = c.req.valid('param');
    return c.json(await verificationsService.downloadDocument(params.id, params.versionId), 200);
  })
  .openapi(approveAdminRoute, async (c) =>
    c.json(
      await verificationsService.approve(c.req.valid('param').id, adminId(c.get('user'))),
      200,
    ),
  )
  .openapi(rejectAdminRoute, async (c) =>
    c.json(
      await verificationsService.reject(
        c.req.valid('param').id,
        adminId(c.get('user')),
        c.req.valid('json'),
      ),
      200,
    ),
  );
