import { headers } from 'next/headers';
import {
  listTaxonomyResponseSchema,
  profileCompletionResponseSchema,
  type CurrentProfileResponse,
  type ProfileCompletionResponse,
  type TaxonomyTerm,
} from '@repo/contracts';
import { api } from '@/lib/api';
import { requireCurrentDesignerProfile } from '@/lib/designer-profile';
import type { ProfileEditorTaxonomy } from '@/lib/profile-editor-types';

const PROFILE_TAXONOMY_KIND = {
  CITY: 'city',
  SCOPE: 'scope',
  THEME: 'theme',
} as const;

type ProfileTaxonomyKind = (typeof PROFILE_TAXONOMY_KIND)[keyof typeof PROFILE_TAXONOMY_KIND];

type TaxonomyResult =
  | { ok: true; terms: TaxonomyTerm[] }
  | { ok: false; terms: []; message: string };

async function fetchTaxonomy(kind: ProfileTaxonomyKind): Promise<TaxonomyResult> {
  try {
    const response = await api.api.taxonomy.terms.$get({ query: { kind } });
    if (!response.ok) {
      return { ok: false, terms: [], message: `Could not load ${kind} options.` };
    }
    const parsed = listTaxonomyResponseSchema.safeParse(await response.json());
    return parsed.success
      ? { ok: true, terms: parsed.data.terms }
      : { ok: false, terms: [], message: `Could not load ${kind} options.` };
  } catch {
    return { ok: false, terms: [], message: `Could not load ${kind} options.` };
  }
}

async function fetchCompletion(cookie: string | null): Promise<ProfileCompletionResponse | null> {
  if (!cookie) return null;
  try {
    const response = await api.api.profiles.me.completion.$get({}, { headers: { cookie } });
    if (!response.ok) return null;
    const parsed = profileCompletionResponseSchema.safeParse(await response.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function includeSelectedTerms(
  options: TaxonomyTerm[],
  footprint: CurrentProfileResponse['footprint'],
  kind: ProfileTaxonomyKind,
): TaxonomyTerm[] {
  const merged = new Map(options.map((option) => [option.id, option]));
  for (const term of footprint) {
    if (term.kind === kind) {
      merged.set(term.id, {
        id: term.id,
        label: term.label,
        slug: term.slug,
        parentId: null,
      });
    }
  }
  return [...merged.values()];
}

export async function getProfileEditorPageData() {
  const profilePromise = requireCurrentDesignerProfile();
  const completionPromise = headers().then((requestHeaders) =>
    fetchCompletion(requestHeaders.get('cookie')),
  );
  const citiesPromise = fetchTaxonomy(PROFILE_TAXONOMY_KIND.CITY);
  const scopesPromise = fetchTaxonomy(PROFILE_TAXONOMY_KIND.SCOPE);
  const themesPromise = fetchTaxonomy(PROFILE_TAXONOMY_KIND.THEME);

  const [profile, completion, cities, scopes, themes] = await Promise.all([
    profilePromise,
    completionPromise,
    citiesPromise,
    scopesPromise,
    themesPromise,
  ]);

  const taxonomy: ProfileEditorTaxonomy = {
    cities: includeSelectedTerms(cities.terms, profile.footprint, PROFILE_TAXONOMY_KIND.CITY),
    scopes: includeSelectedTerms(scopes.terms, profile.footprint, PROFILE_TAXONOMY_KIND.SCOPE),
    themes: includeSelectedTerms(themes.terms, profile.footprint, PROFILE_TAXONOMY_KIND.THEME),
  };
  const taxonomyError = [cities, scopes, themes].some((result) => !result.ok)
    ? 'Some profile footprint options could not be loaded. Your existing selections are preserved.'
    : null;

  return { profile, completion, taxonomy, taxonomyError };
}
