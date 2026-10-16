import { describe, expect, it } from 'vitest';
import { nearbyLocationSchema } from '../src/taxonomy';
import { suggestFilterSchema } from '../src/search';

it('requires a parent city when suggesting an area', () => {
  const area = { kind: 'area', filterKey: 'locality', slug: 'gunjan', label: 'Gunjan, Vapi' };
  expect(suggestFilterSchema.safeParse(area).success).toBe(false);
  expect(suggestFilterSchema.safeParse({ ...area, citySlug: 'vapi' }).success).toBe(true);
});
describe('nearby location coordinates', () => {
  it('accepts finite latitude and longitude including zero', () => {
    expect(nearbyLocationSchema.safeParse({ latitude: 0, longitude: 0 }).success).toBe(true);
  });
  it.each([
    { latitude: 91, longitude: 72 },
    { latitude: 20, longitude: -181 },
    { latitude: NaN, longitude: 72 },
    { latitude: 20, longitude: Infinity },
    { latitude: '20', longitude: 72 },
    { latitude: 20 },
  ])('rejects invalid coordinates %j', (input) => {
    expect(nearbyLocationSchema.safeParse(input).success).toBe(false);
  });
});
