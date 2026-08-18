import { describe, expect, it } from 'vitest';
import { recentSearchesSchema } from '../src/search.js';

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
