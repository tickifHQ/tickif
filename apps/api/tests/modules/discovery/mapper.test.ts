import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ProjectSearchDocument } from '@repo/search';
import type { Derivative } from '@repo/contracts';
import type { FeedProjectRow } from '../../../src/modules/discovery/repository.js';

// Mock external dependencies
vi.mock('@repo/storage', () => ({
  presignDownload: vi.fn(async ({ key }: { key: string }) => `https://signed.example/${key}`),
}));

// Import AFTER mocks are registered
const { collectTaxonomyPairs, normalizeTypesenseHit, normalizePostgresRow, toDiscoveryCard } =
  await import('../../../src/modules/discovery/mapper.js');
const { presignDownload } = await import('@repo/storage');

/**
 * The service resolves labels once per page and hands the map to the mapper, so
 * these tests supply it directly rather than mocking a repository.
 */
const LABELS = new Map([
  ['city:mumbai', 'Mumbai'],
  ['bhk:3-bhk', '3 BHK'],
]);

// ─────────────────────────────────────────────────────────────────────────────
// Test Fixtures
// ─────────────────────────────────────────────────────────────────────────────

function createTypesenseHit(overrides: Partial<ProjectSearchDocument> = {}): ProjectSearchDocument {
  return {
    id: 'proj-123',
    slug: 'modern-mumbai-apartment',
    title: 'Modern Mumbai Apartment',
    description: 'A beautiful 3BHK apartment',
    designerId: 'designer-456',
    designerSlug: 'urban-designs',
    designerName: 'Urban Designs Studio',
    citySlug: 'mumbai',
    localitySlug: 'bandra',
    propertyTypeSlug: 'residential',
    propertySubtypeSlug: 'apartment',
    scopeSlug: 'full-home',
    bhkSlug: '3-bhk',
    budgetBandSlug: '40-60-lakh',
    sizeSqft: 1500,
    themes: ['modern', 'minimalist'],
    materials: ['marble', 'wood'],
    finishes: ['matte', 'glossy'],
    roomSlugs: ['living-room', 'bedroom'],
    roomLabels: ['Living Room', 'Bedroom'],
    tags: ['featured'],
    coverImageKey: 'derivatives/projects/proj-123/cover-small.webp',
    publishedAt: 1700000000000,
    featuredAt: 1705000000000,
    avgRating: 4.8,
    reviewCount: 12,
    ...overrides,
  };
}

function createPostgresRow(overrides: Partial<FeedProjectRow> = {}): FeedProjectRow {
  return {
    id: 'proj-123',
    slug: 'modern-mumbai-apartment',
    title: 'Modern Mumbai Apartment',
    citySlug: 'mumbai',
    bhkSlug: '3-bhk',
    designerName: 'Urban Designs Studio',
    designerSlug: 'urban-designs',
    avgRating: '4.8',
    reviewCount: 12,
    coverStatus: 'ready',
    coverDerivatives: [
      {
        key: 'derivatives/projects/proj-123/cover-small.webp',
        variant: 'small',
        format: 'webp',
        width: 640,
        height: 480,
      },
      {
        key: 'derivatives/projects/proj-123/cover-small.avif',
        variant: 'small',
        format: 'avif',
        width: 640,
        height: 480,
      },
      {
        key: 'derivatives/projects/proj-123/cover-medium.webp',
        variant: 'medium',
        format: 'webp',
        width: 1280,
        height: 960,
      },
    ] as Derivative[],
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// normalizeTypesenseHit tests
// ─────────────────────────────────────────────────────────────────────────────

describe('normalizeTypesenseHit', () => {
  it('maps all fields correctly from Typesense hit', () => {
    const hit = createTypesenseHit();
    const result = normalizeTypesenseHit(hit);

    expect(result).toEqual({
      slug: 'modern-mumbai-apartment',
      title: 'Modern Mumbai Apartment',
      designerName: 'Urban Designs Studio',
      designerSlug: 'urban-designs',
      citySlug: 'mumbai',
      bhkSlug: '3-bhk',
      avgRating: 4.8,
      reviewCount: 12,
      coverImageKey: 'derivatives/projects/proj-123/cover-small.webp',
      coverDerivatives: null,
      coverStatus: 'ready',
    });
  });

  it('defaults avgRating to 0 when undefined', () => {
    const hit = createTypesenseHit({ avgRating: undefined as unknown as number });
    const result = normalizeTypesenseHit(hit);

    expect(result.avgRating).toBe(0);
  });

  it('defaults reviewCount to 0 when undefined', () => {
    const hit = createTypesenseHit({ reviewCount: undefined as unknown as number });
    const result = normalizeTypesenseHit(hit);

    expect(result.reviewCount).toBe(0);
  });

  it('sets coverStatus to "ready" when coverImageKey exists', () => {
    const hit = createTypesenseHit({ coverImageKey: 'some-key.webp' });
    const result = normalizeTypesenseHit(hit);

    expect(result.coverStatus).toBe('ready');
  });

  it('sets coverStatus to null when coverImageKey is null', () => {
    const hit = createTypesenseHit({ coverImageKey: null });
    const result = normalizeTypesenseHit(hit);

    expect(result.coverStatus).toBeNull();
    expect(result.coverImageKey).toBeNull();
  });

  it('handles null designerSlug', () => {
    const hit = createTypesenseHit({ designerSlug: null });
    const result = normalizeTypesenseHit(hit);

    expect(result.designerSlug).toBeNull();
  });

  it('handles null citySlug and bhkSlug', () => {
    const hit = createTypesenseHit({ citySlug: null, bhkSlug: null });
    const result = normalizeTypesenseHit(hit);

    expect(result.citySlug).toBeNull();
    expect(result.bhkSlug).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// normalizePostgresRow tests
// ─────────────────────────────────────────────────────────────────────────────

describe('normalizePostgresRow', () => {
  it('maps all fields correctly from Postgres row', () => {
    const row = createPostgresRow();
    const result = normalizePostgresRow(row);

    expect(result).toEqual({
      slug: 'modern-mumbai-apartment',
      title: 'Modern Mumbai Apartment',
      designerName: 'Urban Designs Studio',
      designerSlug: 'urban-designs',
      citySlug: 'mumbai',
      bhkSlug: '3-bhk',
      avgRating: 4.8,
      reviewCount: 12,
      coverImageKey: null,
      coverDerivatives: row.coverDerivatives,
      coverStatus: 'ready',
    });
  });

  it('parses avgRating string to number', () => {
    const row = createPostgresRow({ avgRating: '3.5' });
    const result = normalizePostgresRow(row);

    expect(result.avgRating).toBe(3.5);
    expect(typeof result.avgRating).toBe('number');
  });

  it('defaults avgRating to 0 when string is invalid', () => {
    const row = createPostgresRow({ avgRating: '' });
    const result = normalizePostgresRow(row);

    expect(result.avgRating).toBe(0);
  });

  it('preserves coverDerivatives from row', () => {
    const derivatives: Derivative[] = [
      { key: 'key1.webp', variant: 'small', format: 'webp', width: 640, height: 480 },
    ];
    const row = createPostgresRow({ coverDerivatives: derivatives });
    const result = normalizePostgresRow(row);

    expect(result.coverDerivatives).toBe(derivatives);
    expect(result.coverDerivatives).toEqual([
      { key: 'key1.webp', variant: 'small', format: 'webp', width: 640, height: 480 },
    ]);
  });

  it('preserves null coverDerivatives from row', () => {
    const row = createPostgresRow({ coverDerivatives: null });
    const result = normalizePostgresRow(row);

    expect(result.coverDerivatives).toBeNull();
  });

  it('preserves coverStatus from row', () => {
    const row = createPostgresRow({ coverStatus: 'processing' });
    const result = normalizePostgresRow(row);

    expect(result.coverStatus).toBe('processing');
  });

  it('handles null designerSlug', () => {
    const row = createPostgresRow({ designerSlug: null });
    const result = normalizePostgresRow(row);

    expect(result.designerSlug).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// toDiscoveryCard tests
// ─────────────────────────────────────────────────────────────────────────────

describe('toDiscoveryCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('cover image handling', () => {
    it('presigns cover image URL when status is "ready" and derivatives exist (Postgres path)', async () => {
      const normalized = normalizePostgresRow(createPostgresRow());
      const result = await toDiscoveryCard(normalized, LABELS);

      expect(presignDownload).toHaveBeenCalledWith({
        key: 'derivatives/projects/proj-123/cover-small.webp',
      });
      expect(result.coverImageUrl).toBe(
        'https://signed.example/derivatives/projects/proj-123/cover-small.webp',
      );
      expect(result.coverImageWidth).toBe(640);
      expect(result.coverImageHeight).toBe(480);
    });

    it('presigns cover image URL when status is "ready" and coverImageKey exists (Typesense path)', async () => {
      const normalized = normalizeTypesenseHit(createTypesenseHit());
      const result = await toDiscoveryCard(normalized, LABELS);

      expect(presignDownload).toHaveBeenCalledWith({
        key: 'derivatives/projects/proj-123/cover-small.webp',
      });
      expect(result.coverImageUrl).toBe(
        'https://signed.example/derivatives/projects/proj-123/cover-small.webp',
      );
      // Typesense path doesn't have dimensions
      expect(result.coverImageWidth).toBeNull();
      expect(result.coverImageHeight).toBeNull();
    });

    it('returns null cover fields when status is "processing"', async () => {
      const row = createPostgresRow({ coverStatus: 'processing' });
      const normalized = normalizePostgresRow(row);
      const result = await toDiscoveryCard(normalized, LABELS);

      expect(presignDownload).not.toHaveBeenCalled();
      expect(result.coverImageUrl).toBeNull();
      expect(result.coverImageWidth).toBeNull();
      expect(result.coverImageHeight).toBeNull();
    });

    it('returns null cover fields when status is "failed"', async () => {
      const row = createPostgresRow({ coverStatus: 'failed' });
      const normalized = normalizePostgresRow(row);
      const result = await toDiscoveryCard(normalized, LABELS);

      expect(presignDownload).not.toHaveBeenCalled();
      expect(result.coverImageUrl).toBeNull();
      expect(result.coverImageWidth).toBeNull();
      expect(result.coverImageHeight).toBeNull();
    });

    it('returns null cover fields when status is null', async () => {
      const row = createPostgresRow({ coverStatus: null, coverDerivatives: null });
      const normalized = normalizePostgresRow(row);
      const result = await toDiscoveryCard(normalized, LABELS);

      expect(presignDownload).not.toHaveBeenCalled();
      expect(result.coverImageUrl).toBeNull();
      expect(result.coverImageWidth).toBeNull();
      expect(result.coverImageHeight).toBeNull();
    });

    it('handles presign error gracefully and returns null', async () => {
      vi.mocked(presignDownload).mockRejectedValueOnce(new Error('Presign failed'));

      const normalized = normalizePostgresRow(createPostgresRow());
      const result = await toDiscoveryCard(normalized, LABELS);

      expect(result.coverImageUrl).toBeNull();
    });
  });

  describe('pickSmallDerivative behavior (tested via toDiscoveryCard)', () => {
    it('prefers "small" variant with "webp" format', async () => {
      const derivatives: Derivative[] = [
        { key: 'cover-small.avif', variant: 'small', format: 'avif', width: 640, height: 480 },
        { key: 'cover-small.webp', variant: 'small', format: 'webp', width: 640, height: 480 },
        { key: 'cover-medium.webp', variant: 'medium', format: 'webp', width: 1280, height: 960 },
      ];
      const row = createPostgresRow({ coverDerivatives: derivatives });
      const normalized = normalizePostgresRow(row);
      const result = await toDiscoveryCard(normalized, LABELS);

      expect(presignDownload).toHaveBeenCalledWith({ key: 'cover-small.webp' });
      expect(result.coverImageWidth).toBe(640);
    });

    it('falls back to any "small" variant if no webp', async () => {
      const derivatives: Derivative[] = [
        { key: 'cover-small.avif', variant: 'small', format: 'avif', width: 640, height: 480 },
        { key: 'cover-medium.webp', variant: 'medium', format: 'webp', width: 1280, height: 960 },
      ];
      const row = createPostgresRow({ coverDerivatives: derivatives });
      const normalized = normalizePostgresRow(row);
      const result = await toDiscoveryCard(normalized, LABELS);

      expect(presignDownload).toHaveBeenCalledWith({ key: 'cover-small.avif' });
      expect(result.coverImageWidth).toBe(640);
    });

    it('returns null if no small variant exists', async () => {
      const derivatives: Derivative[] = [
        { key: 'cover-medium.webp', variant: 'medium', format: 'webp', width: 1280, height: 960 },
        { key: 'cover-large.webp', variant: 'large', format: 'webp', width: 1920, height: 1440 },
      ];
      const row = createPostgresRow({ coverDerivatives: derivatives });
      const normalized = normalizePostgresRow(row);
      const result = await toDiscoveryCard(normalized, LABELS);

      expect(presignDownload).not.toHaveBeenCalled();
      expect(result.coverImageUrl).toBeNull();
      expect(result.coverImageWidth).toBeNull();
      expect(result.coverImageHeight).toBeNull();
    });

    it('handles empty derivatives array', async () => {
      const row = createPostgresRow({ coverDerivatives: [] });
      const normalized = normalizePostgresRow(row);
      const result = await toDiscoveryCard(normalized, LABELS);

      expect(presignDownload).not.toHaveBeenCalled();
      expect(result.coverImageUrl).toBeNull();
    });
  });

  describe('taxonomy label resolution', () => {
    it('resolves city and bhk taxonomy labels', async () => {
      const normalized = normalizePostgresRow(createPostgresRow());
      const result = await toDiscoveryCard(normalized, LABELS);

      expect(result.city).toBe('Mumbai');
      expect(result.bhk).toBe('3 BHK');
    });

    it('returns null for city when citySlug is null', async () => {
      const row = createPostgresRow({ citySlug: null });
      const normalized = normalizePostgresRow(row);
      const result = await toDiscoveryCard(normalized, LABELS);

      expect(result.city).toBeNull();
    });

    it('returns null for bhk when bhkSlug is null', async () => {
      const row = createPostgresRow({ bhkSlug: null });
      const normalized = normalizePostgresRow(row);
      const result = await toDiscoveryCard(normalized, LABELS);

      expect(result.bhk).toBeNull();
    });

    it('returns null when taxonomy label not found', async () => {
      const normalized = normalizePostgresRow(createPostgresRow());
      const result = await toDiscoveryCard(normalized, new Map());

      expect(result.city).toBeNull();
      expect(result.bhk).toBeNull();
    });
  });

  describe('collectTaxonomyPairs', () => {
    it('collects the distinct city and bhk pairs a page needs', () => {
      const items = [
        normalizePostgresRow(createPostgresRow()),
        normalizePostgresRow(createPostgresRow()),
        normalizePostgresRow(createPostgresRow({ citySlug: 'pune', bhkSlug: '2-bhk' })),
      ];

      expect(collectTaxonomyPairs(items)).toEqual([
        { kind: 'city', slug: 'mumbai' },
        { kind: 'bhk', slug: '3-bhk' },
        { kind: 'city', slug: 'pune' },
        { kind: 'bhk', slug: '2-bhk' },
      ]);
    });

    it('skips null slugs', () => {
      const items = [normalizePostgresRow(createPostgresRow({ citySlug: null, bhkSlug: null }))];

      expect(collectTaxonomyPairs(items)).toEqual([]);
    });
  });

  describe('formatRatingSnippet behavior (tested via toDiscoveryCard)', () => {
    it('formats rating snippet as "4.8 (12 reviews)" for plural', async () => {
      const row = createPostgresRow({ avgRating: '4.8', reviewCount: 12 });
      const normalized = normalizePostgresRow(row);
      const result = await toDiscoveryCard(normalized, LABELS);

      expect(result.ratingSnippet).toBe('4.8 (12 reviews)');
    });

    it('formats rating snippet as "4.8 (1 review)" for singular', async () => {
      const row = createPostgresRow({ avgRating: '4.8', reviewCount: 1 });
      const normalized = normalizePostgresRow(row);
      const result = await toDiscoveryCard(normalized, LABELS);

      expect(result.ratingSnippet).toBe('4.8 (1 review)');
    });

    it('returns null for zero reviews', async () => {
      const row = createPostgresRow({ avgRating: '4.5', reviewCount: 0 });
      const normalized = normalizePostgresRow(row);
      const result = await toDiscoveryCard(normalized, LABELS);

      expect(result.ratingSnippet).toBeNull();
    });

    it('formats rating with one decimal place', async () => {
      const row = createPostgresRow({ avgRating: '4.567', reviewCount: 5 });
      const normalized = normalizePostgresRow(row);
      const result = await toDiscoveryCard(normalized, LABELS);

      expect(result.ratingSnippet).toBe('4.6 (5 reviews)');
    });

    it('handles integer rating by adding .0', async () => {
      const row = createPostgresRow({ avgRating: '5', reviewCount: 3 });
      const normalized = normalizePostgresRow(row);
      const result = await toDiscoveryCard(normalized, LABELS);

      expect(result.ratingSnippet).toBe('5.0 (3 reviews)');
    });
  });

  describe('complete Card_Projection output', () => {
    it('produces complete DiscoveryCard with all fields', async () => {
      const normalized = normalizePostgresRow(createPostgresRow());
      const result = await toDiscoveryCard(normalized, LABELS);

      expect(result).toEqual({
        slug: 'modern-mumbai-apartment',
        title: 'Modern Mumbai Apartment',
        coverImageUrl: 'https://signed.example/derivatives/projects/proj-123/cover-small.webp',
        coverImageWidth: 640,
        coverImageHeight: 480,
        designerName: 'Urban Designs Studio',
        designerSlug: 'urban-designs',
        city: 'Mumbai',
        bhk: '3 BHK',
        ratingSnippet: '4.8 (12 reviews)',
      });
    });
  });
});
