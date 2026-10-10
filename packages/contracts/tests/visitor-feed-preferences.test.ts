import { describe, expect, it } from 'vitest';
import { visitorFeedPreferencesInputSchema } from '../src/visitors';

const cityId = '11111111-1111-4111-8111-111111111111';
const localityId = '22222222-2222-4222-8222-222222222222';
describe('visitor feed preferences', () => {
  it.each(['1-bhk', '2-bhk', '3-bhk', '4-plus-bhk', 'villa'])(
    'accepts %s and a taxonomy city',
    (homeType) => {
      expect(
        visitorFeedPreferencesInputSchema.safeParse({ homeType, cityId, localityId }).success,
      ).toBe(true);
    },
  );
  it('accepts an explicit skip', () => {
    expect(
      visitorFeedPreferencesInputSchema.safeParse({
        homeType: null,
        cityId: null,
        localityId: null,
      }).success,
    ).toBe(true);
  });
  it.each([
    {},
    { homeType: 'castle', cityId, localityId },
    { homeType: '3-bhk', cityId: null, localityId: null },
    { homeType: null, cityId, localityId: null },
    { homeType: null, cityId: null, localityId },
    { homeType: '3-bhk', cityId: 'not-a-uuid', localityId: null },
    { homeType: '3-bhk', cityId, localityId, userId: 'someone-else' },
  ])('rejects malformed, partial or caller-controlled identity', (input) => {
    expect(visitorFeedPreferencesInputSchema.safeParse(input).success).toBe(false);
  });
});
