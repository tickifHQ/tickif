import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import {
  bookingIdParamSchema,
  bookingResponseSchema,
  cancelBookingSchema,
  confirmBookingSchema,
  createBookingSchema,
  errorResponseSchema,
  listBookingsQuerySchema,
  listBookingsResponseSchema,
} from '@repo/contracts';
import type { AuthVariables } from '../../lib/auth-middleware.js';
import { requireAuth } from '../../lib/auth-middleware.js';
import { AppError } from '../../lib/errors.js';
import { validationHook } from '../../lib/validation.js';
import { bookingsService } from './service.js';

const errorJson = (description: string) => ({
  description,
  content: { 'application/json': { schema: errorResponseSchema } },
});

function caller(user: AuthVariables['user'], session: AuthVariables['session']) {
  if (!user) throw AppError.unauthorized();
  return {
    userId: user.id,
    name: user.name,
    phoneNumber: user.phoneNumber ?? null,
    phoneNumberVerified: user.phoneNumberVerified === true,
    isBanned: !!user.banned && (!user.banExpires || user.banExpires > new Date()),
    activeOrgId: session?.activeOrganizationId ?? null,
    activeTeamId: session?.activeTeamId ?? null,
  };
}

const createBookingRoute = createRoute({
  method: 'post',
  path: '/',
  tags: ['Bookings'],
  summary: 'Request a consultation',
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  request: {
    body: {
      content: { 'application/json': { schema: createBookingSchema } },
    },
  },
  responses: {
    201: {
      description: 'Consultation requested',
      content: { 'application/json': { schema: bookingResponseSchema } },
    },
    401: errorJson('Unauthorized'),
    403: errorJson('Account suspended'),
    404: errorJson('Designer profile not found'),
    409: errorJson('Open consultation limit reached'),
    422: errorJson('Invalid booking request'),
  },
});

const listMineRoute = createRoute({
  method: 'get',
  path: '/mine',
  tags: ['Bookings'],
  summary: 'List consultations requested by the caller',
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  request: { query: listBookingsQuerySchema },
  responses: {
    200: {
      description: 'Requester consultation page',
      content: { 'application/json': { schema: listBookingsResponseSchema } },
    },
    401: errorJson('Unauthorized'),
    403: errorJson('Account suspended'),
  },
});

const listInboxRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['Bookings'],
  summary: 'List consultations for the active designer organization',
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  request: { query: listBookingsQuerySchema },
  responses: {
    200: {
      description: 'Designer consultation inbox page',
      content: { 'application/json': { schema: listBookingsResponseSchema } },
    },
    401: errorJson('Unauthorized'),
    403: errorJson('Organization membership required'),
    422: errorJson('No active organization selected'),
  },
});

const confirmBookingRoute = createRoute({
  method: 'post',
  path: '/{id}/confirm',
  tags: ['Bookings'],
  summary: 'Confirm one of the requested consultation slots',
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  request: {
    params: bookingIdParamSchema,
    body: {
      content: { 'application/json': { schema: confirmBookingSchema } },
    },
  },
  responses: {
    200: {
      description: 'Confirmed consultation',
      content: { 'application/json': { schema: bookingResponseSchema } },
    },
    401: errorJson('Unauthorized'),
    403: errorJson('Organization membership required'),
    404: errorJson('Booking not found'),
    409: errorJson('Invalid or concurrent transition'),
    422: errorJson('Confirmed slot is not a requester preference'),
  },
});

const completeBookingRoute = createRoute({
  method: 'post',
  path: '/{id}/complete',
  tags: ['Bookings'],
  summary: 'Mark a confirmed consultation complete',
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  request: { params: bookingIdParamSchema },
  responses: {
    200: {
      description: 'Completed consultation',
      content: { 'application/json': { schema: bookingResponseSchema } },
    },
    401: errorJson('Unauthorized'),
    403: errorJson('Organization membership required'),
    404: errorJson('Booking not found'),
    409: errorJson('Invalid or concurrent transition'),
  },
});

const cancelBookingRoute = createRoute({
  method: 'post',
  path: '/{id}/cancel',
  tags: ['Bookings'],
  summary: 'Cancel an open consultation',
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  request: {
    params: bookingIdParamSchema,
    body: {
      content: { 'application/json': { schema: cancelBookingSchema } },
    },
  },
  responses: {
    200: {
      description: 'Cancelled consultation',
      content: { 'application/json': { schema: bookingResponseSchema } },
    },
    401: errorJson('Unauthorized'),
    403: errorJson('Organization membership required'),
    404: errorJson('Booking not found'),
    409: errorJson('Invalid or concurrent transition'),
    422: errorJson('Designer cancellation reason required'),
  },
});

export const bookingsRoutes = new OpenAPIHono<{ Variables: AuthVariables }>({
  defaultHook: validationHook,
})
  .openapi(createBookingRoute, async (c) => {
    const result = await bookingsService.create(
      c.req.valid('json'),
      caller(c.get('user'), c.get('session')),
    );
    return c.json(result, 201);
  })
  .openapi(listMineRoute, async (c) => {
    const result = await bookingsService.listMine(
      c.req.valid('query'),
      caller(c.get('user'), c.get('session')),
    );
    return c.json(result, 200);
  })
  .openapi(listInboxRoute, async (c) => {
    const result = await bookingsService.listInbox(
      c.req.valid('query'),
      caller(c.get('user'), c.get('session')),
    );
    return c.json(result, 200);
  })
  .openapi(confirmBookingRoute, async (c) => {
    const { id } = c.req.valid('param');
    const result = await bookingsService.confirm(
      id,
      c.req.valid('json'),
      caller(c.get('user'), c.get('session')),
    );
    return c.json(result, 200);
  })
  .openapi(completeBookingRoute, async (c) => {
    const { id } = c.req.valid('param');
    const result = await bookingsService.complete(
      id,
      caller(c.get('user'), c.get('session')),
    );
    return c.json(result, 200);
  })
  .openapi(cancelBookingRoute, async (c) => {
    const { id } = c.req.valid('param');
    const result = await bookingsService.cancel(
      id,
      c.req.valid('json'),
      caller(c.get('user'), c.get('session')),
    );
    return c.json(result, 200);
  });

export type BookingsRoutes = typeof bookingsRoutes;
