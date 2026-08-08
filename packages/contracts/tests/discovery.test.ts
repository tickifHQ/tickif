import { describe, expect, it } from 'vitest';
import {
  discoveryCardSchema,
  discoveryFeedQuerySchema,
  discoveryFeedResponseSchema,
  feedProjectSchema,
} from '../src/index.js';

const card = {
  id: '11111111-1111-4111-8111-111111111111',
  slug: 'calm-home',
  title: 'Calm Home',
  studio: 'Studio One',
  city: 'Mumbai',
  locality: 'Bandra',
  rating: 4.8,
  reviewCount: 12,
  budget: '₹40-60 lakh',
  tags: ['3 BHK', 'Modern'],
  coverImageId: '22222222-2222-4222-8222-222222222222',
  coverImageUrl: 'https://images.example.com/thumb.webp',
  imageWidth: 320,
  imageHeight: 240,
};

describe('discovery contracts', () => {
  it('uses the canonical public project card schema', () => {
    expect(discoveryCardSchema).toBe(feedProjectSchema);
    expect(discoveryCardSchema.safeParse(card).success).toBe(true);
  });

  it('accepts optional bounded search text', () => {
    expect(discoveryFeedQuerySchema.safeParse({ q: 'calm home' }).success).toBe(true);
    expect(discoveryFeedQuerySchema.safeParse({ q: 'x'.repeat(201) }).success).toBe(false);
  });

  it('requires explicit fallback metadata in responses', () => {
    expect(
      discoveryFeedResponseSchema.safeParse({
        items: [card],
        page: 1,
        limit: 24,
        hasMore: false,
        source: 'search',
        facetDistribution: {},
        fallback: 'relaxed',
        relaxedFilters: ['localitySlug'],
      }).success,
    ).toBe(true);
  });
});
