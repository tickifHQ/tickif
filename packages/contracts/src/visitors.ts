import { z } from 'zod';

/** E.164 without formatting separators: leading + and 8–15 digits total. */
export const e164PhoneNumberSchema = z
  .string()
  .trim()
  .regex(/^\+[1-9]\d{7,14}$/, 'Enter a valid E.164 phone number')
  .meta({ id: 'E164PhoneNumber' });

const visitorAddressSchema = z.string().trim().min(1).max(300);

export const upsertVisitorProfileSchema = z
  .object({
    address: visitorAddressSchema.nullable(),
    whatsappNumber: e164PhoneNumberSchema.nullable(),
  })
  .strict()
  .meta({ id: 'UpsertVisitorProfile' });
export type UpsertVisitorProfileInput = z.infer<typeof upsertVisitorProfileSchema>;

export const visitorProfileResponseSchema = z
  .object({
    address: visitorAddressSchema.nullable(),
    whatsappNumber: e164PhoneNumberSchema.nullable(),
    onboardingCompletedAt: z.string().datetime(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict()
  .meta({ id: 'VisitorProfile' });
export type VisitorProfileResponse = z.infer<typeof visitorProfileResponseSchema>;
