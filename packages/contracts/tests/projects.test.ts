import { describe, it, expect } from 'vitest';
import {
  createProjectRoomSchema,
  createProjectSchema,
  linkProjectImageSchema,
  listProjectsQuerySchema,
  portfolioProjectsQuerySchema,
  publicImageDetailResponseSchema,
  projectListStatus,
  projectStatus,
  projectRoomSchema,
  reorderProjectRoomsSchema,
  updateProjectSchema,
} from '../src/projects.js';

// A valid RFC-4122 UUID (version + variant nibbles correct).
const VALID_UUID = '11111111-1111-4111-8111-111111111111';

describe('createProjectSchema', () => {
  it('accepts a valid payload', () => {
    const result = createProjectSchema.safeParse({
      title: 'Sunlit Bandra Apartment',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a too-short title', () => {
    const result = createProjectSchema.safeParse({
      title: 'x',
    });
    expect(result.success).toBe(false);
  });

  it('allows the backend to generate a title from project metadata', () => {
    const result = createProjectSchema.safeParse({
      buildingName: 'Maitri Apartments',
      propertyTypeSlug: 'residential',
      propertySubtypeSlug: 'apartment',
      bhkSlug: '2-bhk',
      citySlug: 'bengaluru',
      budgetBandSlug: 'luxury',
    });
    expect(result.success).toBe(true);
  });

  it('allows taxonomy refs and metadata without a client-supplied designer id', () => {
    const result = createProjectSchema.safeParse({
      title: 'Valid Title',
      citySlug: 'mumbai',
      propertySubtypeSlug: 'apartment',
      budgetBandSlug: 'premium',
      metadata: { scopeLabels: ['full-home'] },
    });

    expect(result.success).toBe(true);
  });
});

describe('updateProjectSchema', () => {
  it('accepts a partial draft update including a nullable cover image', () => {
    const result = updateProjectSchema.safeParse({
      description: null,
      coverImageId: null,
      metadata: { source: 'draft-builder' },
    });

    expect(result.success).toBe(true);
  });
});

describe('listProjectsQuerySchema', () => {
  it('keeps moderation statuses persisted while using grouped list buckets', () => {
    expect(projectStatus.parse('changes_requested')).toBe('changes_requested');
    expect(projectListStatus.safeParse('changes_requested').success).toBe(false);
  });

  it('applies defaults and coerces string pagination', () => {
    const parsed = listProjectsQuerySchema.parse({ limit: '10', page: '5' });
    expect(parsed).toMatchObject({ limit: 10, page: 5 });
  });

  it('defaults dashboard listing filters when absent', () => {
    const parsed = listProjectsQuerySchema.parse({});
    expect(parsed).toMatchObject({ status: 'all', limit: 12, page: 1, sort: '-updatedAt' });
  });

  it('accepts the Linear dashboard status buckets and search', () => {
    const parsed = listProjectsQuerySchema.parse({
      status: 'in_review',
      q: 'bandra',
      sort: 'title',
    });
    expect(parsed).toMatchObject({ status: 'in_review', q: 'bandra', sort: 'title' });
  });
});

describe('portfolioProjectsQuerySchema', () => {
  it('supports each portfolio status group with bounded pagination', () => {
    expect(portfolioProjectsQuerySchema.parse({ status: 'changes_requested' })).toMatchObject({
      status: 'changes_requested',
      page: 1,
      limit: 12,
      sort: '-updatedAt',
    });
    expect(portfolioProjectsQuerySchema.safeParse({ status: 'unknown' }).success).toBe(false);
    expect(portfolioProjectsQuerySchema.safeParse({ limit: 51 }).success).toBe(false);
  });
});

describe('publicImageDetailResponseSchema', () => {
  it('accepts a public image detail payload keyed by the active image id', () => {
    const result = publicImageDetailResponseSchema.safeParse({
      project: {
        id: VALID_UUID,
        slug: 'sunlit-bandra-apartment',
        title: 'Sunlit Bandra Apartment',
        studio: 'Studio A',
        city: 'Mumbai',
        locality: 'Bandra',
        rating: 4.5,
        reviewCount: 10,
        budget: '₹15L - ₹35L',
        tags: ['3 BHK'],
        coverImageId: '22222222-2222-4222-8222-222222222222',
        coverImageUrl: null,
        imageWidth: 480,
        imageHeight: 600,
      },
      images: [
        {
          id: '22222222-2222-4222-8222-222222222222',
          url: 'https://images.example.com/living-room.webp',
          width: 1200,
          height: 900,
          roomName: 'Living Room',
        },
      ],
      activeImageId: '22222222-2222-4222-8222-222222222222',
    });

    expect(result.success).toBe(true);
  });
});

describe('project room contracts', () => {
  it('accepts a create payload with provisional room labels', () => {
    const result = createProjectRoomSchema.safeParse({
      roomTypeId: VALID_UUID,
      name: 'Living Room',
      sortOrder: 0,
      metadata: {
        labels: ['airy', 'wood tones'],
        attributeLabels: { finish: ['veneer'] },
      },
    });

    expect(result.success).toBe(true);
  });

  it('rejects empty label entries', () => {
    const result = createProjectRoomSchema.safeParse({
      roomTypeId: VALID_UUID,
      name: 'Living Room',
      metadata: { labels: [''] },
    });

    expect(result.success).toBe(false);
  });

  it('bounds provisional attribute label keys and entry count', () => {
    const longKey = 'x'.repeat(81);
    const tooManyKeys = Object.fromEntries(
      Array.from({ length: 21 }, (_, i) => [`finish-${i}`, ['veneer']]),
    );

    expect(
      createProjectRoomSchema.safeParse({
        roomTypeId: VALID_UUID,
        name: 'Living Room',
        metadata: { attributeLabels: { [longKey]: ['veneer'] } },
      }).success,
    ).toBe(false);
    expect(
      createProjectRoomSchema.safeParse({
        roomTypeId: VALID_UUID,
        name: 'Living Room',
        metadata: { attributeLabels: tooManyKeys },
      }).success,
    ).toBe(false);
  });

  it('rejects project room responses with out-of-bounds metadata', () => {
    const result = projectRoomSchema.safeParse({
      id: VALID_UUID,
      projectId: '22222222-2222-4222-8222-222222222222',
      roomTypeId: '33333333-3333-4333-8333-333333333333',
      name: 'Kitchen',
      description: null,
      sortOrder: 1,
      metadata: { labels: [''], attributeLabels: { ['x'.repeat(90)]: Array(25).fill('veneer') } },
      createdAt: '2026-06-15T00:00:00.000Z',
      updatedAt: '2026-06-15T00:00:00.000Z',
    });

    expect(result.success).toBe(false);
  });

  it('rejects duplicate room ids in reorder payloads', () => {
    const result = reorderProjectRoomsSchema.safeParse({
      rooms: [
        { id: VALID_UUID, sortOrder: 0 },
        { id: VALID_UUID, sortOrder: 1 },
      ],
    });

    expect(result.success).toBe(false);
  });

  it('accepts image linking payloads with room clearing', () => {
    const result = linkProjectImageSchema.safeParse({ roomId: null, sortOrder: 2 });

    expect(result.success).toBe(true);
  });
});
