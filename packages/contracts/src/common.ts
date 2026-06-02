import { z } from 'zod';

/** Standard error envelope returned by the API. */
export const errorResponseSchema = z
  .object({
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.unknown().optional(),
    }),
  })
  .meta({ id: 'Error' });
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
