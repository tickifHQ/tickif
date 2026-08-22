import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DESIGNER_DEFAULT_SORT } from '@repo/search';

const mocks = vi.hoisted(() => ({
  search: vi.fn(),
}));

vi.mock('@repo/search', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return {
    ...original,
    searchClient: () => ({
      collections: () => ({
        documents: () => ({ search: mocks.search }),
      }),
    }),
  };
});

import { searchDesigners } from '../../../src/modules/search/repository.js';

const params = {
  q: '*',
  query_by: 'displayName',
  page: 1,
  per_page: 24,
};

describe('search repository designer ranking compatibility', () => {
  beforeEach(() => {
    mocks.search.mockReset();
  });

  // Verbatim from Typesense 30.2 (`typesense-js` prefixes the server message) when the
  // collection predates the optional verification fields. It names neither field, which is why
  // the "Could not find a field named" match alone never fires on the rollout path.
  const EVAL_PARSE_ERROR =
    'Request failed with HTTP code 400 | Server said: Error parsing eval expression in sort_by clause.';

  it.each([
    ['the eval expression cannot be parsed', EVAL_PARSE_ERROR],
    [
      'a sort field is reported missing by name',
      'Request failed with HTTP code 404 | Server said: Could not find a field named `isKycVerified` in the schema for sorting.',
    ],
  ])('retries default discovery without verification ranking when %s', async (_label, message) => {
    mocks.search.mockRejectedValueOnce(new Error(message)).mockResolvedValueOnce({
      hits: [],
      found: 0,
      facet_counts: [],
      search_time_ms: 2,
    });

    await expect(searchDesigners(params)).resolves.toMatchObject({
      hits: [],
      estimatedTotalHits: 0,
    });
    expect(mocks.search).toHaveBeenCalledTimes(2);
    expect(mocks.search.mock.calls[0]?.[0].sort_by).toContain('_eval(isKycVerified:true');
    expect(mocks.search.mock.calls[1]?.[0].sort_by).toBe(DESIGNER_DEFAULT_SORT);
  });

  it('does not retry when the caller supplied an explicit sort', async () => {
    const error = new Error(EVAL_PARSE_ERROR);
    mocks.search.mockRejectedValueOnce(error);

    await expect(searchDesigners({ ...params, sort_by: 'projectCount:desc' })).rejects.toBe(error);
    expect(mocks.search).toHaveBeenCalledTimes(1);
  });

  it('does not hide unrelated Typesense failures', async () => {
    const error = new Error('Typesense is unavailable');
    mocks.search.mockRejectedValueOnce(error);

    await expect(searchDesigners(params)).rejects.toBe(error);
    expect(mocks.search).toHaveBeenCalledTimes(1);
  });
});
