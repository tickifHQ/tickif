import { z } from 'zod';
import { e164PhoneNumberSchema } from './common';
import { createProjectSchema } from './projects';
import { discoveryFeedQuerySchema } from './discovery';

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

export const visitorHomeTypeSchema = z
  .enum(['1-bhk', '2-bhk', '3-bhk', '4-plus-bhk', 'villa'])
  .meta({ id: 'VisitorHomeType' });
export type VisitorHomeType = z.infer<typeof visitorHomeTypeSchema>;

export const visitorFeedPreferencesSchema = z
  .object({
    homeType: visitorHomeTypeSchema.nullable(),
    citySlug: createProjectSchema.shape.citySlug.unwrap().nullable(),
    localitySlug: createProjectSchema.shape.localitySlug.unwrap().nullable(),
  })
  .strict()
  .refine((input) => input.localitySlug === null || input.citySlug !== null, {
    path: ['citySlug'],
    message: 'A city is required with a locality',
  })
  .meta({ id: 'VisitorFeedPreferences' });
export type VisitorFeedPreferences = z.infer<typeof visitorFeedPreferencesSchema>;

export const visitorFeedFiltersSchema = z
  .object({
    bhkSlug: discoveryFeedQuerySchema.shape.bhkSlug,
    propertyTypeSlug: discoveryFeedQuerySchema.shape.propertyTypeSlug,
    propertySubtypeSlug: discoveryFeedQuerySchema.shape.propertySubtypeSlug,
    citySlug: discoveryFeedQuerySchema.shape.citySlug,
    localitySlug: discoveryFeedQuerySchema.shape.localitySlug,
  })
  .strict()
  .meta({ id: 'VisitorFeedFilters' });
export type VisitorFeedFilters = z.infer<typeof visitorFeedFiltersSchema>;

export const visitorFeedPreferencesResponseSchema = z
  .object({
    preferences: visitorFeedPreferencesSchema.nullable(),
    filters: visitorFeedFiltersSchema,
  })
  .strict()
  .meta({ id: 'VisitorFeedPreferencesResponse' });
export type VisitorFeedPreferencesResponse = z.infer<typeof visitorFeedPreferencesResponseSchema>;

const HOME_FILTERS: Record<VisitorHomeType, VisitorFeedFilters> = {
  '1-bhk': { bhkSlug: '1-bhk' },
  '2-bhk': { bhkSlug: '2-bhk' },
  '3-bhk': { bhkSlug: '3-bhk' },
  '4-plus-bhk': { bhkSlug: ['4-bhk', '4-plus-bhk'] },
  villa: { propertyTypeSlug: 'residential', propertySubtypeSlug: 'villa' },
};

/** The same mapping drives the unsaved preview and the saved feed. */
export function visitorFeedFilters(preferences: VisitorFeedPreferences | null): VisitorFeedFilters {
  return {
    ...(preferences?.homeType ? HOME_FILTERS[preferences.homeType] : {}),
    ...(preferences?.citySlug ? { citySlug: preferences.citySlug } : {}),
    ...(preferences?.localitySlug ? { localitySlug: preferences.localitySlug } : {}),
  };
}
