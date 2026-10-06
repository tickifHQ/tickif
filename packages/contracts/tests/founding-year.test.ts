import { afterEach, describe, expect, it, vi } from 'vitest';
import { onboardDesignerSchema, resolveProfileExperience, updateProfileSchema } from '../src';

afterEach(() => vi.useRealTimers());

describe('founding years', () => {
  it('accepts older years through onboarding and editing and derives experience', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-06T12:00:00Z'));
    for (const foundedYear of [1900, 1995, 2010, 2026]) {
      for (const entityType of ['individual', 'company'] as const) {
        expect(
          onboardDesignerSchema.safeParse({
            entityType,
            userName: 'Studio Owner',
            companyName: 'Established Studio',
            foundedYear,
          }).success,
        ).toBe(true);
      }
      expect(updateProfileSchema.safeParse({ foundedYear }).success).toBe(true);
      expect(resolveProfileExperience({ foundedYear, yearsExperience: 0 }, 2026)).toBe(
        2026 - foundedYear,
      );
    }
  });

  it('rejects future, fractional and pre-contract years in both write contracts', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-12-31T23:59:59Z'));
    for (const foundedYear of [2027, 2100, 1899, 2000.5, NaN]) {
      expect(
        onboardDesignerSchema.safeParse({
          entityType: 'company',
          userName: 'Studio Owner',
          companyName: 'Established Studio',
          foundedYear,
        }).success,
      ).toBe(false);
      expect(updateProfileSchema.safeParse({ foundedYear }).success).toBe(false);
    }
    vi.setSystemTime(new Date('2027-01-01T00:00:00Z'));
    expect(updateProfileSchema.safeParse({ foundedYear: 2027 }).success).toBe(true);
    expect(
      onboardDesignerSchema.safeParse({
        entityType: 'company',
        userName: 'Studio Owner',
        companyName: 'Established Studio',
        foundedYear: 2027,
      }).success,
    ).toBe(true);
  });

  it('keeps unknown years optional and allows clearing a saved year', () => {
    expect(
      onboardDesignerSchema.safeParse({
        entityType: 'company',
        userName: 'Studio Owner',
        companyName: 'Established Studio',
      }).success,
    ).toBe(true);
    expect(updateProfileSchema.safeParse({ foundedYear: null }).success).toBe(true);
    expect(updateProfileSchema.safeParse({}).success).toBe(true);
  });
});
