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

  it('retries default discovery without verification ranking when its fields are unavailable', async () => {
    mocks.search
      .mockRejectedValueOnce(
        new Error('Could not find a field named `isKycVerified` in the schema.'),
      )
      .mockResolvedValueOnce({
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

  it('does not hide unrelated Typesense failures', async () => {
    const error = new Error('Typesense is unavailable');
    mocks.search.mockRejectedValueOnce(error);

    await expect(searchDesigners(params)).rejects.toBe(error);
    expect(mocks.search).toHaveBeenCalledTimes(1);
  });
});
