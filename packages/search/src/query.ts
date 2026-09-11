import type { SearchParams } from 'typesense/lib/Typesense/Documents.js';

type DiscoverySearchParams = Omit<SearchParams<Record<string, unknown>>, 'streamConfig'>;

const ZERO_RESULT_QUERY_CORRECTIONS: Readonly<Record<string, string>> = {
  bad: 'bed',
};

/** Three sort keys: relevance, rating, then currently paid coverage. */
export function discoveryRanking(now = Date.now(), ratingFirst = false): string {
  const paid = `_eval(paidUntil:>${now}):desc`;
  return ratingFirst
    ? `avgRating:desc,${paid},_text_match:desc`
    : `_text_match:desc,avgRating:desc,${paid}`;
}

function missingDiscoveryField(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    /Could not find.*(?:paidUntil|portfolioTerms)/i.test(error.message) ||
    /400.*Error parsing eval expression in sort_by clause/.test(error.message)
  );
}

/** Bounded rollout and known-query correction. Always preserve a query that already matches. */
export async function searchWithDiscoveryFallback<T extends { found?: number }>(
  search: (params: DiscoverySearchParams) => Promise<T>,
  params: DiscoverySearchParams,
  legacy: DiscoverySearchParams,
): Promise<T> {
  let effective = params;
  let result: T;
  try {
    result = await search(effective);
  } catch (error) {
    if (
      !missingDiscoveryField(error) ||
      (params.sort_by === legacy.sort_by && params.query_by === legacy.query_by)
    )
      throw error;
    effective = legacy;
    result = await search(effective);
  }
  const query = params.q?.trim().toLowerCase() ?? '';
  const correction = ZERO_RESULT_QUERY_CORRECTIONS[query];
  if (result.found === 0 && correction) {
    return search({ ...effective, q: correction, drop_tokens_threshold: 0 });
  }
  return result;
}
