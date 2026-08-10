import {
  listTaxonomyResponseSchema,
  type CurrentProfileResponse,
  type TaxonomyTerm,
} from '@repo/contracts';
import { api } from '@/lib/api';
import { getProfileCompletion, requireCurrentDesignerProfile } from '@/lib/designer-profile';
import {
  PROFILE_TAXONOMY_KIND,
  type ProfileEditorOption,
  type ProfileEditorTaxonomy,
  type ProfileTaxonomyKind,
} from '@/lib/profile-editor-types';

type TaxonomyResult =
  | { ok: true; terms: TaxonomyTerm[] }
  | { ok: false; terms: []; message: string };

const TAXONOMY_LABEL: Record<ProfileTaxonomyKind, string> = {
  [PROFILE_TAXONOMY_KIND.CITY]: 'city',
  [PROFILE_TAXONOMY_KIND.SCOPE]: 'service',
  [PROFILE_TAXONOMY_KIND.THEME]: 'design theme',
};

async function fetchTaxonomy(kind: ProfileTaxonomyKind): Promise<TaxonomyResult> {
  try {
    const response = await api.api.taxonomy.terms.$get({ query: { kind } });
    if (!response.ok) {
      return { ok: false, terms: [], message: `Could not load ${TAXONOMY_LABEL[kind]} options.` };
    }
    const parsed = listTaxonomyResponseSchema.safeParse(await response.json());
    return parsed.success
      ? { ok: true, terms: parsed.data.terms }
      : { ok: false, terms: [], message: `Could not load ${TAXONOMY_LABEL[kind]} options.` };
  } catch {
    return { ok: false, terms: [], message: `Could not load ${TAXONOMY_LABEL[kind]} options.` };
  }
}

function includeSelectedTerms(
  options: TaxonomyTerm[],
  footprint: CurrentProfileResponse['footprint'],
  kind: ProfileTaxonomyKind,
): ProfileEditorOption[] {
  const merged = new Map<string, ProfileEditorOption>();
  for (const option of options) merged.set(option.id, { id: option.id, label: option.label });
  for (const term of footprint) {
    if (term.kind === kind && !merged.has(term.id)) {
      merged.set(term.id, { id: term.id, label: term.label });
    }
  }
  return [...merged.values()];
}

export async function getProfileEditorPageData() {
  const profilePromise = requireCurrentDesignerProfile();
  const completionPromise = getProfileCompletion();
  const citiesPromise = fetchTaxonomy(PROFILE_TAXONOMY_KIND.CITY);
  const scopesPromise = fetchTaxonomy(PROFILE_TAXONOMY_KIND.SCOPE);
  const themesPromise = fetchTaxonomy(PROFILE_TAXONOMY_KIND.THEME);

  const [profile, completionResult, cities, scopes, themes] = await Promise.all([
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
  const taxonomyFailures = [cities, scopes, themes].filter(
    (result): result is Extract<TaxonomyResult, { ok: false }> => !result.ok,
  );
  const taxonomyError =
    taxonomyFailures.length > 0
      ? `${taxonomyFailures.map((failure) => failure.message).join(' ')} Your existing selections are preserved.`
      : null;

  return {
    profile,
    completion: completionResult.data,
    completionError: completionResult.ok ? null : completionResult.message,
    taxonomy,
    taxonomyError,
  };
}
