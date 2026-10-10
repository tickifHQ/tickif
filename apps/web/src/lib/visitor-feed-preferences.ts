import type { SearchProjectsQuery, VisitorFeedPreferences, VisitorHomeType } from '@repo/contracts';

export const VISITOR_HOME_LABELS: Record<VisitorHomeType, string> = {
  '1-bhk': '1 BHK',
  '2-bhk': '2 BHK',
  '3-bhk': '3 BHK',
  '4-plus-bhk': '4 BHK+',
  villa: 'Villa',
};

export function visitorSearchFilters(
  preferences: Pick<VisitorFeedPreferences, 'homeType' | 'city' | 'locality'>,
): Partial<SearchProjectsQuery> {
  if (!preferences.homeType || !preferences.city) return {};
  return {
    citySlug: preferences.city.slug,
    ...(preferences.locality ? { localitySlug: preferences.locality.slug } : {}),
    ...(preferences.homeType === 'villa'
      ? { propertySubtypeSlug: 'villa' }
      : {
          bhkSlug:
            preferences.homeType === '4-plus-bhk' ? ['4-bhk', '4-plus-bhk'] : preferences.homeType,
        }),
  };
}

export function visitorFeedHref(
  preferences: Pick<VisitorFeedPreferences, 'homeType' | 'city' | 'locality'>,
): string {
  const filters = visitorSearchFilters(preferences);
  const params = new URLSearchParams();
  for (const [key, name] of [
    ['citySlug', 'city'],
    ['localitySlug', 'locality'],
    ['bhkSlug', 'bhk'],
    ['propertySubtypeSlug', 'propertySubtype'],
  ] as const) {
    const value = filters[key];
    if (value) params.set(name, Array.isArray(value) ? value.join(',') : value);
  }
  return params.size ? `/home?${params}` : '/home';
}
