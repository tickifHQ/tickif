import {
  listTaxonomyResponseSchema,
  searchDesignersResponseSchema,
  type SearchDesignersQuery,
} from '@repo/contracts';
import { api } from '@/lib/api';
import { DESIGNER_FACETS, type DesignerFacetOptions } from '@/lib/designer-discovery-params';

export async function fetchDesignerSearch(query: SearchDesignersQuery) {
  const response = await api.api.search.designers.$get(
    { query: { ...query, q: query.q || '*' } },
    { init: { cache: 'no-store' } },
  );
  if (!response.ok) throw new Error('Designer search is unavailable.');
  const parsed = searchDesignersResponseSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error('Designer search returned an invalid response.');
  return parsed.data;
}

/** Facet options remain available when the selected combination has no matches. */
export async function fetchDesignerFacetOptions(): Promise<DesignerFacetOptions> {
  const options: DesignerFacetOptions = {
    citySlugs: [],
    localitySlugs: [],
    scopeSlugs: [],
    themeSlugs: [],
  };
  await Promise.all(
    DESIGNER_FACETS.map(async ({ key, kind }) => {
      try {
        const response = await api.api.taxonomy.terms.$get(
          { query: { kind } },
          { init: { next: { revalidate: 3600 } } },
        );
        if (!response.ok) return;
        const parsed = listTaxonomyResponseSchema.safeParse(await response.json());
        if (parsed.success)
          options[key] = parsed.data.terms.map(({ slug, label }) => ({ value: slug, label }));
      } catch {
        /* Search facets and selected URL values remain usable if taxonomy is down. */
      }
    }),
  );
  return options;
}
