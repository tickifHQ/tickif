import { z } from 'zod';
import { e164PhoneNumberSchema } from './common';

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
    onboardingCompletedAt: z.string().datetime().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict()
  .meta({ id: 'VisitorProfile' });
export type VisitorProfileResponse = z.infer<typeof visitorProfileResponseSchema>;
