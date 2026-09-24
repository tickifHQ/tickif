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
  for (const [id, avgRating, rankingTier, paidUntil, publishedAt, title] of [
    ['corporate-five', 5, 2, 2000000000000, 1, 'Bedroom'],
    ['professional-five', 5, 1, 2000000000000, 2, 'Bedroom'],
    ['free-five', 5, 0, 0, 3, 'Bedroom'],
    ['corporate-four', 4, 2, 2000000000000, 4, 'Bedroom'],
    ['irrelevant-paid', 5, 2, 2000000000000, 5, 'Kitchen'],
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
        rankingTier,
        paidUntil,
        publishedAt,
      });
  }
});
afterAll(async () => {
  await client.collections<Record<string, unknown> & { id: string }>(collection).delete();
});

describe('discovery ranking against Typesense', () => {
  it('keeps higher ratings first and ranks Corporate then Professional on equal-rating ties', async () => {
    const result = await client
      .collections<Record<string, unknown> & { id: string }>(collection)
      .documents()
      .search({ q: 'bed', query_by: 'title', sort_by: discoveryRanking(1900000000000) });
    expect(result.hits?.map((hit) => hit.document.id)).toEqual([
      'corporate-five',
      'professional-five',
      'free-five',
      'corporate-four',
    ]);
  });
  it('keeps a more relevant free project above a higher-rated Corporate project', async () => {
    const documents = client
      .collections<Record<string, unknown> & { id: string }>(collection)
      .documents();
    await documents.create({
      id: 'exact-free',
      title: 'Bed',
      designerId: 'exact-free',
      designerName: 'Studio',
      themes: [],
      materials: [],
      finishes: [],
      roomSlugs: [],
      roomLabels: [],
      tags: [],
      avgRating: 4,
      rankingTier: 0,
      paidUntil: 0,
      publishedAt: 1,
    });
    try {
      const result = await documents.search({
        q: 'bed',
        query_by: 'title',
        sort_by: discoveryRanking(1900000000000),
      });
      expect(result.hits?.[0]?.document.id).toBe('exact-free');
    } finally {
      await client.collections(collection).documents('exact-free').delete();
    }
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
      'corporate-five',
      'professional-five',
      'free-five',
      'corporate-four',
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
      'corporate-five',
      'professional-five',
      'free-five',
      'corporate-four',
    ]);

    const unrelated = await searchWithDiscoveryFallback(
      (params) =>
        client
          .collections<Record<string, unknown> & { id: string }>(collection)
          .documents()
          .search(params),
      { ...query, q: 'bar' },
      { ...query, q: 'bar' },
    );
    expect(unrelated.found).toBe(0);
  });
  it('stops paid priority at the coverage boundary', async () => {
    const result = await client
      .collections<Record<string, unknown> & { id: string }>(collection)
      .documents()
      .search({ q: 'bed', query_by: 'title', sort_by: discoveryRanking(2000000000000) });
    const ids = result.hits?.map((hit) => hit.document.id);
    expect(ids?.[0]).toBe('free-five');
    expect(ids?.slice(1, 3)).toEqual(
      expect.arrayContaining(['corporate-five', 'professional-five']),
    );
    expect(ids?.[3]).toBe('corporate-four');
  });
  it('keeps an exact bad match instead of replacing it with bedroom results', async () => {
    await client.collections(collection).documents().create({
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
    for (const [id, avgRating, rankingTier, paidUntil, portfolioTerms] of [
      ['corporate-five', 5, 2, 2000000000000, ['Bedroom']],
      ['professional-five', 5, 1, 2000000000000, ['Bedroom']],
      ['free-five', 5, 0, 0, ['Bedroom']],
      ['corporate-four', 4, 2, 2000000000000, ['Bedroom']],
      ['kitchen-studio', 5, 2, 2000000000000, ['Kitchen']],
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
          rankingTier,
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
  it('finds generic rooms through published portfolio terms and breaks rating ties by tier', async () => {
    const result = await client
      .collections<Record<string, unknown> & { id: string }>(designers)
      .documents()
      .search({
        q: 'bed',
        query_by: DESIGNER_QUERY_BY.join(','),
        sort_by: discoveryRanking(1900000000000),
      });
    expect(result.hits?.map((hit) => hit.document.id)).toEqual([
      'corporate-five',
      'professional-five',
      'free-five',
      'corporate-four',
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
