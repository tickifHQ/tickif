import { describe, expect, it } from 'vitest';
import { earlyBirdClaimSchema, earlyBirdEndsAt } from '../src/early-bird';

describe('early-bird terms', () => {
  it('uses three calendar months with Indian month-end clamping', () => {
    expect(earlyBirdEndsAt(new Date('2026-11-30T20:00:00Z')).toISOString()).toBe(
      '2027-02-28T20:00:00.000Z',
    );
    expect(earlyBirdEndsAt(new Date('2026-11-30T10:00:00Z')).toISOString()).toBe(
      '2027-02-28T10:00:00.000Z',
    );
  });
  it('only accepts a paid tier, never a caller-supplied price or duration', () => {
    expect(earlyBirdClaimSchema.safeParse({ targetTier: 'hobby' }).success).toBe(false);
    expect(earlyBirdClaimSchema.parse({ targetTier: 'corporate', months: 24 })).toEqual({
      targetTier: 'corporate',
    });
  });
});
