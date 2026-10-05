import type { ProfileOwnerResponse } from './profiles';

/** Calendar-year studio age, with legacy experience retained when no year was saved. */
export function resolveProfileExperience(
  profile: Pick<Partial<ProfileOwnerResponse>, 'foundedYear' | 'yearsExperience'>,
  currentYear = new Date().getUTCFullYear(),
): number | null {
  if (profile.foundedYear != null) {
    return Number.isInteger(profile.foundedYear) &&
      profile.foundedYear >= 1900 &&
      profile.foundedYear <= currentYear
      ? currentYear - profile.foundedYear
      : null;
  }
  const legacy = profile.yearsExperience;
  return legacy != null && Number.isInteger(legacy) && legacy > 0 ? legacy : null;
}
