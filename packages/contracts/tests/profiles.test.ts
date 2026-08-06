import { describe, expect, it } from 'vitest';
import {
  PROFILE_FOOTPRINT_LIMITS,
  listTaxonomyQuerySchema,
  taxonomyKindSchema,
  updateProfileSchema,
} from '../src';

describe('profile and taxonomy contracts', () => {
  it('shares the complete taxonomy enum with query and profile validation', () => {
    expect(taxonomyKindSchema.options).toContain(taxonomyKindSchema.enum.city);
    expect(listTaxonomyQuerySchema.safeParse({ kind: 'city' }).success).toBe(true);
    expect(listTaxonomyQuerySchema.safeParse({ kind: 'citys' }).success).toBe(false);
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
});
