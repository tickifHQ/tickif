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

/** E.164 without formatting separators: leading + and 8 to 15 digits total. */
export const e164PhoneNumberSchema = z
  .string()
  .trim()
  .regex(/^\+[1-9]\d{7,14}$/, 'Enter a valid E.164 phone number')
  .meta({ id: 'E164PhoneNumber' });
