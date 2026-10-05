import { describe, expect, it } from 'vitest';
import { resolveProfileExperience } from '../src/profile-experience';

describe('resolveProfileExperience', () => {
  it('uses the saved founding year instead of a stale zero counter', () => {
    expect(resolveProfileExperience({ foundedYear: 2018, yearsExperience: 0 }, 2026)).toBe(8);
  });
  it('distinguishes a new studio from missing information', () => {
    expect(resolveProfileExperience({ foundedYear: 2026, yearsExperience: 0 }, 2026)).toBe(0);
    expect(resolveProfileExperience({ foundedYear: null, yearsExperience: 0 }, 2026)).toBeNull();
  });
  it('preserves valid legacy experience without a founding year', () => {
    expect(resolveProfileExperience({ yearsExperience: 12 }, 2026)).toBe(12);
    expect(resolveProfileExperience({ yearsExperience: -1 }, 2026)).toBeNull();
  });
  it('advances on year rollover without overwriting stored history', () => {
    const profile = { foundedYear: 2020, yearsExperience: 2 };
    expect(resolveProfileExperience(profile, 2026)).toBe(6);
    expect(resolveProfileExperience(profile, 2027)).toBe(7);
    expect(profile.yearsExperience).toBe(2);
  });
  it('does not manufacture negative experience for a future founding year', () => {
    expect(resolveProfileExperience({ foundedYear: 2027, yearsExperience: 0 }, 2026)).toBeNull();
  });
});
