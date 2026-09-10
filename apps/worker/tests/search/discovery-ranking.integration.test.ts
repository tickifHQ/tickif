import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  searchCollectionSchema,
  DESIGNER_QUERY_BY,
  searchWriteClient,
  discoveryRanking,
  searchWithDiscoveryFallback,
} from '@repo/search';

const collection = `discovery_ranking_test_${Date.now()}`;
const client = searchWriteClient();
beforeAll(async () => {
  await client
    .collections()
    .create({ ...searchCollectionSchema('projects', collection), synonym_sets: [] });
  for (const [id, avgRating, paidUntil, publishedAt, title] of [
    ['paid-five', 5, 2000000000000, 1, 'Bedroom'],
    ['free-five', 5, 0, 3, 'Bedroom'],
    ['paid-four', 4, 2000000000000, 4, 'Bedroom'],
    ['irrelevant-paid', 5, 2000000000000, 5, 'Kitchen'],
  ] as const) {
    await client
      .collections<Record<string, unknown> & { id: string }>(collection)
      .documents()
      .create({
        id,
        title,
        designerId: id,
        designerName: 'Studio',
        themes: [],
        materials: [],
        finishes: [],
        roomSlugs: [],
        roomLabels: [],
        tags: [],
        avgRating,
        paidUntil,
        publishedAt,
      });
  }
});
afterAll(async () => {
  await client.collections<Record<string, unknown> & { id: string }>(collection).delete();
});

describe('discovery ranking against Typesense', () => {
  it('keeps higher ratings first and paid wins equal-rating ties without admitting unrelated work', async () => {
    const result = await client
      .collections<Record<string, unknown> & { id: string }>(collection)
      .documents()
      .search({ q: 'bed', query_by: 'title', sort_by: discoveryRanking(1900000000000) });
    expect(result.hits?.map((hit) => hit.document.id)).toEqual([
      'paid-five',
      'free-five',
      'paid-four',
    ]);
  });
  it('preserves ranking across pages', async () => {
    const pages = await Promise.all(
      [1, 2].map((page) =>
        client
          .collections<Record<string, unknown> & { id: string }>(collection)
          .documents()
          .search({
            q: 'bed',
            query_by: 'title',
            sort_by: discoveryRanking(1900000000000),
            per_page: 2,
            page,
          }),
      ),
    );
    expect(pages.flatMap((page) => page.hits?.map((hit) => hit.document.id) ?? [])).toEqual([
      'paid-five',
      'free-five',
      'paid-four',
    ]);
  });
  it('recovers bad as a short typo without returning unrelated paid content', async () => {
    const query = { q: 'bad', query_by: 'title', sort_by: discoveryRanking(1900000000000) };
    const result = await searchWithDiscoveryFallback(
      (p) =>
        client
          .collections<Record<string, unknown> & { id: string }>(collection)
          .documents()
          .search(p),
      query,
      query,
    );
    expect(result.hits?.map((hit) => hit.document.id)).toEqual([
      'paid-five',
      'free-five',
      'paid-four',
    ]);
  });
  it('stops paid priority at the coverage boundary', async () => {
    const result = await client
      .collections<Record<string, unknown> & { id: string }>(collection)
      .documents()
      .search({ q: 'bed', query_by: 'title', sort_by: discoveryRanking(2000000000000) });
    expect(result.hits?.map((hit) => hit.document.id)).toEqual([
      'free-five',
      'paid-five',
      'paid-four',
    ]);
  });
  it('keeps an exact bad match instead of replacing it with bedroom results', async () => {
    await client
      .collections(collection)
      .documents()
      .create({
        id: 'exact-bad',
        title: 'Bad',
        designerId: 'literal',
        designerName: 'Studio',
        themes: [],
        materials: [],
        finishes: [],
        roomSlugs: [],
        roomLabels: [],
        tags: [],
        avgRating: 3,
        paidUntil: 0,
        publishedAt: 0,
      });
    try {
      const query = { q: 'bad', query_by: 'title', sort_by: discoveryRanking(1900000000000) };
      const result = await searchWithDiscoveryFallback(
        (p) =>
          client
            .collections<Record<string, unknown> & { id: string }>(collection)
            .documents()
            .search(p),
        query,
        query,
      );
      expect(result.hits?.map((hit) => hit.document.id)).toEqual(['exact-bad']);
    } finally {
      await client.collections(collection).documents('exact-bad').delete();
    }
  });
});

describe('designer portfolio matching against Typesense', () => {
  const designers = `${collection}_designers`;
  beforeAll(async () => {
    await client
      .collections()
      .create({ ...searchCollectionSchema('designers', designers), synonym_sets: [] });
    for (const [id, avgRating, paidUntil, portfolioTerms] of [
      ['paid-five', 5, 2000000000000, ['Bedroom']],
      ['free-five', 5, 0, ['Bedroom']],
      ['paid-four', 4, 2000000000000, ['Bedroom']],
      ['kitchen-studio', 5, 2000000000000, ['Kitchen']],
    ] as const) {
      await client
        .collections(designers)
        .documents()
        .create({
          id,
          displayName: 'Studio',
          entityType: 'individual',
          citySlugs: [],
          localitySlugs: [],
          scopeSlugs: [],
          themeSlugs: [],
          yearsExperience: 1,
          projectCount: 1,
          avgRating,
          paidUntil,
          portfolioTerms: [...portfolioTerms],
          reviewCount: 1,
          updatedAt: 1,
        });
    }
  });
  afterAll(async () => {
    await client.collections(designers).delete();
  });
  it('finds generic rooms through published portfolio terms and breaks rating ties by paid coverage', async () => {
    const result = await client
      .collections<Record<string, unknown> & { id: string }>(designers)
      .documents()
      .search({
        q: 'bed',
        query_by: DESIGNER_QUERY_BY.join(','),
        sort_by: discoveryRanking(1900000000000),
      });
    expect(result.hits?.map((hit) => hit.document.id)).toEqual([
      'paid-five',
      'free-five',
      'paid-four',
    ]);
    const kitchen = await client
      .collections<Record<string, unknown> & { id: string }>(designers)
      .documents()
      .search({
        q: 'kitchen',
        query_by: DESIGNER_QUERY_BY.join(','),
        sort_by: discoveryRanking(1900000000000),
      });
    expect(kitchen.hits?.map((hit) => hit.document.id)).toEqual(['kitchen-studio']);
  });
});
