import { z } from 'zod';

export const healthResponseSchema = z
  .object({
    status: z.literal('ok'),
    service: z.literal('tickif-api'),
  })
  .meta({ id: 'HealthResponse' });

export const readinessResponseSchema = z
  .object({
    status: z.enum(['ready', 'not-ready', 'draining']),
    service: z.literal('tickif-api'),
    checks: z.object({ postgres: z.enum(['up', 'down']) }),
  })
  .meta({ id: 'ReadinessResponse' });
