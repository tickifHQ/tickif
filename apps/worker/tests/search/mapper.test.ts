import { describe, expect, it } from 'vitest';
import {
  mapDesignerSearchDocument,
  mapProjectSearchDocument,
  type DesignerSearchSource,
  type ProjectSearchSource,
} from '../../src/search/mapper.js';

describe('search projection mapper', () => {
  it('builds a deterministic project document from public derivatives and taxonomy unions', () => {
    const source: ProjectSearchSource = {
      project: {
        id: 'project-1',
        slug: 'calm-home',
        title: 'Calm Home',
        description: 'A warm renovation',
        designerId: 'designer-1',
        citySlug: 'mumbai',
        localitySlug: 'bandra',
        propertyTypeSlug: 'residential',
        propertySubtypeSlug: 'apartment',
        scopeSlug: 'full-home',
        bhkSlug: '3-bhk',
        budgetBandSlug: '20-40-lakh',
        sizeSqft: 1400,
        publishedAt: new Date('2026-07-01T00:00:00.000Z'),
        featuredAt: null,
      },
      designer: { slug: 'studio-one', displayName: 'Studio One', avgRating: '4.75', reviewCount: 16 },
      cover: {
        id: '11111111-1111-4111-8111-111111111111',
        status: 'ready',
        derivatives: [
          { variant: 'medium', format: 'webp', key: 'medium.webp', width: 1280, height: 960 },
          { variant: 'thumb', format: 'jpeg', key: 'thumb.jpg', width: 320, height: 240 },
          { variant: 'thumb', format: 'webp', key: 'thumb.webp', width: 320, height: 240 },
        ],
      },
      rooms: [
        {
          slug: 'living-room',
          label: 'Living room',
          name: 'Formal lounge',
          labels: ['Open plan'],
          attributeLabels: ['Warm', 'Open plan'],
        },
      ],
      images: [
        {
          themeSlugs: ['warm', 'minimal'],
          materialSlugs: ['wood'],
          finishSlugs: ['matte'],
          tagSlugs: ['sunlit'],
        },
        {
          themeSlugs: ['minimal'],
          materialSlugs: ['stone'],
          finishSlugs: ['matte'],
          tagSlugs: ['sunlit', 'custom'],
        },
      ],
    };

    expect(mapProjectSearchDocument(source)).toEqual({
      id: 'project-1',
      slug: 'calm-home',
      title: 'Calm Home',
      description: 'A warm renovation',
      designerId: 'designer-1',
      designerSlug: 'studio-one',
      designerName: 'Studio One',
      citySlug: 'mumbai',
      localitySlug: 'bandra',
      propertyTypeSlug: 'residential',
      propertySubtypeSlug: 'apartment',
      scopeSlug: 'full-home',
      bhkSlug: '3-bhk',
      budgetBandSlug: '20-40-lakh',
      sizeSqft: 1400,
      themes: ['minimal', 'warm'],
      materials: ['stone', 'wood'],
      finishes: ['matte'],
      roomSlugs: ['living-room'],
      roomLabels: ['Formal lounge', 'Living room', 'Open plan', 'Warm'],
      tags: ['custom', 'sunlit'],
      coverImageKey: 'thumb.webp',
      coverImageId: '11111111-1111-4111-8111-111111111111',
      coverImageWidth: 320,
      coverImageHeight: 240,
      publishedAt: new Date('2026-07-01T00:00:00.000Z').getTime(),
      featuredAt: null,
      avgRating: 4.75,
      reviewCount: 16,
    });
  });

  it('maps only first-party profile rating fields into the designer document', () => {
    const source: DesignerSearchSource = {
      profile: {
        id: 'designer-1',
        slug: 'studio-one',
        displayName: 'Studio One',
        bio: 'Residential interiors',
        entityType: 'company',
        yearsExperience: 8,
        projectCount: 12,
        avgRating: '4.75',
        reviewCount: 16,
        logoImageId: 'originals/logos/designer-1/logo',
        updatedAt: new Date('2026-07-02T00:00:00.000Z'),
      },
      footprint: [
        { kind: 'city', slug: 'mumbai' },
        { kind: 'scope', slug: 'full-home' },
        { kind: 'theme', slug: 'minimal' },
        { kind: 'theme', slug: 'minimal' },
      ],
    };

    expect(mapDesignerSearchDocument(source)).toEqual({
      id: 'designer-1',
      slug: 'studio-one',
      displayName: 'Studio One',
      bio: 'Residential interiors',
      entityType: 'company',
      citySlugs: ['mumbai'],
      localitySlugs: [],
      scopeSlugs: ['full-home'],
      themeSlugs: ['minimal'],
      yearsExperience: 8,
      projectCount: 12,
      avgRating: 4.75,
      reviewCount: 16,
      logoImageKey: 'originals/logos/designer-1/logo',
      updatedAt: new Date('2026-07-02T00:00:00.000Z').getTime(),
    });
  });
});
