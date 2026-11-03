import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import {
  sendWhatsappCodeSchema,
  verifyWhatsappCodeSchema,
  whatsappChallengeResponseSchema,
  whatsappProofResponseSchema,
  errorResponseSchema,
} from '@repo/contracts';
import { requireAuth, type AuthVariables } from '../../lib/auth-middleware.js';
import { validationHook } from '../../lib/validation.js';
import { whatsappService } from './service.js';

const errorJson = (description: string) => ({
  description,
  content: { 'application/json': { schema: errorResponseSchema } },
});
const common = {
  tags: ['WhatsApp verification'],
  middleware: requireAuth,
  security: [{ cookieAuth: [] }],
};
const send = createRoute({
  ...common,
  method: 'post',
  path: '/send',
  request: { body: { content: { 'application/json': { schema: sendWhatsappCodeSchema } } } },
  responses: {
    200: {
      description: 'Code requested',
      content: { 'application/json': { schema: whatsappChallengeResponseSchema } },
    },
    401: errorJson('Unauthorized'),
    429: errorJson('Resend limited'),
    502: errorJson('Delivery failed'),
  },
});
const verify = createRoute({
  ...common,
  method: 'post',
  path: '/verify',
  request: { body: { content: { 'application/json': { schema: verifyWhatsappCodeSchema } } } },
  responses: {
    200: {
      description: 'Number verified',
      content: { 'application/json': { schema: whatsappProofResponseSchema } },
    },
    401: errorJson('Unauthorized'),
    422: errorJson('Invalid code'),
  },
});
export const whatsappRoutes = new OpenAPIHono<{ Variables: AuthVariables }>({
  defaultHook: validationHook,
})
  .openapi(send, async (c) => {
    c.header('Cache-Control', 'private, no-store');
    return c.json(await whatsappService.send(c.get('user')!.id, c.req.valid('json')), 200);
  })
  .openapi(verify, async (c) => {
    c.header('Cache-Control', 'private, no-store');
    return c.json(await whatsappService.verify(c.get('user')!.id, c.req.valid('json')), 200);
  });
