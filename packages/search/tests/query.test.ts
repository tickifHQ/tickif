import { describe, expect, it, vi } from 'vitest';
import { discoveryRanking, searchWithDiscoveryFallback } from '../src/query.js';
const query = { q: 'bad', query_by: 'title', sort_by: discoveryRanking(1000), page: 1 };
const legacy = { ...query, sort_by: '_text_match:desc,publishedAt:desc' };
describe('bounded discovery query recovery', () => {
  it('does not replace an existing exact match with a typo correction', async () => {
    const search = vi.fn().mockResolvedValue({ found: 1 });
    await searchWithDiscoveryFallback(search, query, legacy);
    expect(search).toHaveBeenCalledTimes(1);
  });
  it('tries one short-word correction only after zero matches, preserving filters and pagination', async () => {
    const search = vi.fn().mockResolvedValueOnce({ found: 0 }).mockResolvedValueOnce({ found: 3 });
    await expect(
      searchWithDiscoveryFallback(
        search,
        { ...query, page: 2, filter_by: 'citySlug:=pune' },
        legacy,
      ),
    ).resolves.toEqual({ found: 3 });
    expect(search.mock.calls[1]?.[0]).toMatchObject({
      q: 'bad',
      page: 2,
      filter_by: 'citySlug:=pune',
      min_len_1typo: 3,
      num_typos: 1,
      drop_tokens_threshold: 0,
    });
  });
  it.each(['ba', 'a', '123', 'bad kitchen', 'zzzxqv'])('does not broaden %s', async (q) => {
    const search = vi.fn().mockResolvedValue({ found: 0 });
    await searchWithDiscoveryFallback(search, { ...query, q }, legacy);
    expect(search).toHaveBeenCalledTimes(1);
  });
  it('uses old fields during rollout, then still recovers a short query', async () => {
    const search = vi
      .fn()
      .mockRejectedValueOnce(new Error('400 Error parsing eval expression in sort_by clause.'))
      .mockResolvedValueOnce({ found: 0 })
      .mockResolvedValueOnce({ found: 2 });
    await searchWithDiscoveryFallback(search, query, legacy);
    expect(search.mock.calls[2]?.[0]).toMatchObject({ sort_by: legacy.sort_by, min_len_1typo: 3 });
  });
  it('propagates network failure instead of hiding it as empty results', async () => {
    const search = vi.fn().mockRejectedValue(new Error('unavailable'));
    await expect(searchWithDiscoveryFallback(search, query, legacy)).rejects.toThrow('unavailable');
    expect(search).toHaveBeenCalledTimes(1);
  });
});
