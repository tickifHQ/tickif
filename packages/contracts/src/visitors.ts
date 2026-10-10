import { z } from 'zod';
import { e164PhoneNumberSchema } from './common';
import { taxonomyTermSchema } from './taxonomy';

export const VISITOR_HOME_TYPES = ['1-bhk', '2-bhk', '3-bhk', '4-plus-bhk', 'villa'] as const;
export const visitorHomeTypeSchema = z.enum(VISITOR_HOME_TYPES).meta({ id: 'VisitorHomeType' });
export type VisitorHomeType = z.infer<typeof visitorHomeTypeSchema>;

export const visitorFeedPreferencesInputSchema = z
  .object({
    homeType: visitorHomeTypeSchema.nullable(),
    cityId: z.uuid().nullable(),
    localityId: z.uuid().nullable(),
  })
  .strict()
  .refine((value) => Boolean(value.homeType) === Boolean(value.cityId), {
    message: 'Choose both your home type and city, or skip both.',
  })
  .refine((value) => !value.localityId || Boolean(value.cityId), {
    message: 'A locality requires a city.',
  })
  .meta({ id: 'VisitorFeedPreferencesInput' });
export type VisitorFeedPreferencesInput = z.infer<typeof visitorFeedPreferencesInputSchema>;

export const visitorFeedPreferencesResponseSchema = z
  .object({
    homeType: visitorHomeTypeSchema.nullable(),
    city: taxonomyTermSchema.nullable(),
    locality: taxonomyTermSchema.nullable(),
    onboardingCompletedAt: z.string().datetime().nullable(),
  })
  .strict()
  .meta({ id: 'VisitorFeedPreferences' });
export type VisitorFeedPreferences = z.infer<typeof visitorFeedPreferencesResponseSchema>;

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
