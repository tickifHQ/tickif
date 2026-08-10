import { describe, expect, it } from 'vitest';
import {
  PROFILE_FOOTPRINT_LIMITS,
  PROFILE_STAFF_COUNT_MAX,
  listTaxonomyQuerySchema,
  onboardDesignerSchema,
  taxonomyKindSchema,
  updateProfileSchema,
} from '../src';

describe('profile and taxonomy contracts', () => {
  it('shares the complete taxonomy enum while keeping public queries forward-compatible', () => {
    expect(taxonomyKindSchema.options).toContain(taxonomyKindSchema.enum.city);
    expect(listTaxonomyQuerySchema.safeParse({ kind: 'city' }).success).toBe(true);
    expect(listTaxonomyQuerySchema.safeParse({ kind: 'future_kind' }).success).toBe(true);
  });

  it('uses shared footprint limits and user-facing validation messages', () => {
    const tooManyCities = Array.from(
      { length: PROFILE_FOOTPRINT_LIMITS.city + 1 },
      (_, index) => `${index + 1}1111111-1111-4111-8111-111111111111`,
    );
    const result = updateProfileSchema.safeParse({
      displayName: 'M',
      foundedYear: 1899,
      cityIds: tooManyCities,
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.flatten().fieldErrors).toMatchObject({
      displayName: ['Use at least 2 characters.'],
      foundedYear: ['Enter a year from 1900 onward.'],
      cityIds: [`Select up to ${PROFILE_FOOTPRINT_LIMITS.city} cities.`],
    });
  });

  it('bounds staff count consistently for onboarding and profile updates', () => {
    const staffCount = PROFILE_STAFF_COUNT_MAX + 1;
    const update = updateProfileSchema.safeParse({ staffCount });
    const onboarding = onboardDesignerSchema.safeParse({
      entityType: 'individual',
      userName: 'Designer Name',
      staffCount,
    });

    expect(update.success).toBe(false);
    expect(onboarding.success).toBe(false);
    if (update.success) return;
    expect(update.error.flatten().fieldErrors.staffCount).toEqual([
      `Enter ${PROFILE_STAFF_COUNT_MAX} or fewer.`,
    ]);
  });
});
