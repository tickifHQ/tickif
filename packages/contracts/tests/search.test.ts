import { describe, expect, it } from 'vitest';
import { projectHitSchema, recentSearchesSchema } from '../src/search.js';
describe('search studio verification', () => {
  const schema = projectHitSchema.pick({ studioIsVerified: true });
  it('preserves booleans and compatibility without converting text into verification', () => {
    for (const input of [{ studioIsVerified: true }, { studioIsVerified: false }, {}])
      expect(schema.safeParse(input).success).toBe(true);
    expect(schema.safeParse({ studioIsVerified: 'true' }).success).toBe(false);
  });
});

describe('saved search budget labels', () => {
  const schema = projectHitSchema.pick({ budgetBandLabel: true });
  it.each([{ budgetBandLabel: '₹15L - ₹35L' }, { budgetBandLabel: null }, {}])(
    'accepts saved, missing and older-response labels: %j',
    (value) => expect(schema.safeParse(value).success).toBe(true),
  );
  it('rejects a non-text budget label', () => {
    expect(schema.safeParse({ budgetBandLabel: 1500000 }).success).toBe(false);
  });
});

describe('recentSearchesSchema', () => {
  it('accepts bounded search strings and trims whitespace', () => {
    expect(recentSearchesSchema.safeParse(['  sunlit kitchen  ', 'Mumbai homes'])).toEqual({
      success: true,
      data: ['sunlit kitchen', 'Mumbai homes'],
    });
  });

  it('rejects invalid entries and more than five searches', () => {
    expect(recentSearchesSchema.safeParse(['sunlit kitchen', { query: 'invalid' }]).success).toBe(
      false,
    );
    expect(
      recentSearchesSchema.safeParse(['one', 'two', 'three', 'four', 'five', 'six']).success,
    ).toBe(false);
  });
});
