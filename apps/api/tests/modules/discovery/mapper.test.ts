import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Derivative } from '@repo/contracts';
import type { ProjectSearchDocument } from '@repo/search';
import type { FeedProjectRow } from '../../../src/modules/discovery/repository.js';

vi.mock('@repo/storage', () => ({
  presignDownload: vi.fn(async ({ key }: { key: string }) => `https://signed.example/${key}`),
}));

const { collectTaxonomyPairs, normalizePostgresRow, normalizeTypesenseHit, toDiscoveryCard } =
  await import('../../../src/modules/discovery/mapper.js');
const { presignDownload } = await import('@repo/storage');

const labels = new Map([
  ['city:mumbai', 'Mumbai'],
  ['bhk:3-bhk', '3 BHK'],
  ['budget_band:40-60-lakh', '₹40-60 lakh'],
  ['theme:modern', 'Modern'],
]);
const localities = new Map([['mumbai:bandra', 'Bandra']]);

function searchHit(overrides: Partial<ProjectSearchDocument> = {}): ProjectSearchDocument {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    slug: 'modern-home',
    title: 'Modern Home',
    description: null,
    designerId: '22222222-2222-4222-8222-222222222222',
    designerSlug: 'studio-one',
    designerName: 'Studio One',
    citySlug: 'mumbai',
    localitySlug: 'bandra',
    propertyTypeSlug: null,
    propertySubtypeSlug: null,
    scopeSlug: null,
    bhkSlug: '3-bhk',
    budgetBandSlug: '40-60-lakh',
    sizeSqft: 1200,
    themes: ['modern'],
    materials: [],
    finishes: [],
    roomSlugs: [],
    roomLabels: [],
    tags: [],
    coverImageKey: 'small.webp',
    coverImageId: '33333333-3333-4333-8333-333333333333',
    coverImageWidth: 640,
    coverImageHeight: 480,
    publishedAt: 1,
    featuredAt: null,
    avgRating: 4.8,
    reviewCount: 12,
    ...overrides,
  };
}

function postgresRow(overrides: Partial<FeedProjectRow> = {}): FeedProjectRow {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    slug: 'modern-home',
    title: 'Modern Home',
    designerName: 'Studio One',
    designerSlug: 'studio-one',
    citySlug: 'mumbai',
    localitySlug: 'bandra',
    bhkSlug: '3-bhk',
    budgetBandSlug: '40-60-lakh',
    avgRating: '4.8',
    reviewCount: 12,
    coverImageId: '33333333-3333-4333-8333-333333333333',
    coverStatus: 'ready',
    coverDerivatives: [
      { key: 'small.webp', variant: 'small', format: 'webp', width: 640, height: 480 },
      { key: 'thumb.webp', variant: 'thumb', format: 'webp', width: 320, height: 240 },
    ] as Derivative[],
    ...overrides,
  };
}

describe('discovery card mapper', () => {
  beforeEach(() => vi.clearAllMocks());

  it('maps the Typesense projection to the canonical public project card', async () => {
    const card = await toDiscoveryCard(normalizeTypesenseHit(searchHit()), labels, localities);

    expect(card).toEqual({
      id: '11111111-1111-4111-8111-111111111111',
      slug: 'modern-home',
      title: 'Modern Home',
      studio: 'Studio One',
      city: 'Mumbai',
      locality: 'Bandra',
      rating: 4.8,
      reviewCount: 12,
      budget: '₹40-60 lakh',
      tags: ['3 BHK', 'Modern'],
      coverImageId: '33333333-3333-4333-8333-333333333333',
      coverImageUrl: 'https://signed.example/small.webp',
      imageWidth: 640,
      imageHeight: 480,
    });
  });

  it('maps Postgres through the same card contract and derivative policy', async () => {
    const item = { ...normalizePostgresRow(postgresRow()), themeSlugs: ['modern'] };
    await expect(toDiscoveryCard(item, labels, localities)).resolves.toMatchObject({
      studio: 'Studio One',
      locality: 'Bandra',
      tags: ['3 BHK', 'Modern'],
      coverImageUrl: 'https://signed.example/small.webp',
      imageWidth: 640,
      imageHeight: 480,
    });
  });

  it.each(['processing', 'failed', null] as const)(
    'does not expose a Postgres cover while its status is %s',
    async (coverStatus) => {
      const card = await toDiscoveryCard(
        normalizePostgresRow(postgresRow({ coverStatus })),
        labels,
        localities,
      );

      expect(presignDownload).not.toHaveBeenCalled();
      expect(card).toMatchObject({ coverImageUrl: null, imageWidth: null, imageHeight: null });
    },
  );

  it('returns a null URL when signing a ready Postgres cover fails', async () => {
    vi.mocked(presignDownload).mockRejectedValueOnce(new Error('Presign failed'));

    const card = await toDiscoveryCard(normalizePostgresRow(postgresRow()), labels, localities);

    expect(card.coverImageUrl).toBeNull();
  });

  it('falls back from a missing small derivative to the card-sized thumb', async () => {
    const card = await toDiscoveryCard(
      normalizePostgresRow(
        postgresRow({
          coverDerivatives: [
            { key: 'large.webp', variant: 'large', format: 'webp', width: 1600, height: 1200 },
            { key: 'thumb.webp', variant: 'thumb', format: 'webp', width: 320, height: 240 },
          ],
        }),
      ),
      labels,
      localities,
    );

    expect(presignDownload).toHaveBeenCalledWith({ key: 'thumb.webp' });
    expect(card).toMatchObject({
      coverImageUrl: 'https://signed.example/thumb.webp',
      imageWidth: 320,
      imageHeight: 240,
    });
  });

  it('does not fall back to oversized derivatives for a feed card', async () => {
    const card = await toDiscoveryCard(
      normalizePostgresRow(
        postgresRow({
          coverDerivatives: [
            { key: 'large.webp', variant: 'large', format: 'webp', width: 1600, height: 1200 },
          ],
        }),
      ),
      labels,
      localities,
    );

    expect(presignDownload).not.toHaveBeenCalled();
    expect(card).toMatchObject({ coverImageUrl: null, imageWidth: null, imageHeight: null });
  });

  it('degrades unavailable covers without dropping card identity', async () => {
    const card = await toDiscoveryCard(
      normalizeTypesenseHit(
        searchHit({ coverImageKey: null, coverImageId: null, coverImageWidth: null }),
      ),
      labels,
      localities,
    );
    expect(card).toMatchObject({ coverImageId: null, coverImageUrl: null, imageWidth: null });
  });

  it('collects each taxonomy label once for the page', () => {
    const item = normalizeTypesenseHit(searchHit());
    expect(collectTaxonomyPairs([item, item])).toEqual([
      { kind: 'city', slug: 'mumbai' },
      { kind: 'bhk', slug: '3-bhk' },
      { kind: 'budget_band', slug: '40-60-lakh' },
      { kind: 'theme', slug: 'modern' },
    ]);
  });
});
