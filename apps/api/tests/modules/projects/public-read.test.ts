import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  ProjectRecord,
  ProjectRoomRecord,
  ProjectFeedItemRecord,
} from '../../../src/modules/projects/repository.js';

// --- Mocks ---

vi.mock('@repo/storage', () => ({
  deleteObject: vi.fn(async () => undefined),
  presignDownload: vi.fn(async ({ key }: { key: string }) => `https://signed.example/${key}`),
}));

vi.mock('../../../src/modules/projects/repository.js', () => ({
  projectsRepository: {
    findPublicProjectBySlug: vi.fn(),
    findPublishedFeedProjectByImageId: vi.fn(),
    listPublishedByDesigner: vi.fn(),
    findSimilarPublished: vi.fn(),
    findDesignerById: vi.fn(),
    findById: vi.fn(),
    listRooms: vi.fn(),
    listPublicGalleryImages: vi.fn(),
    findCoverImages: vi.fn(),
    findTaxonomyLabels: vi.fn(),
    findLocalityLabels: vi.fn(),
    slugify: (t: string) =>
      t
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .slice(0, 60),
  },
}));

const { projectsService } = await import('../../../src/modules/projects/service.js');
const { projectsRepository } = await import('../../../src/modules/projects/repository.js');

beforeEach(() => vi.clearAllMocks());

// --- Factories ---

function makeProject(overrides: Partial<ProjectRecord> = {}): ProjectRecord {
  return {
    id: 'project-1',
    designerId: 'designer-1',
    title: 'Modern Apartment',
    slug: 'modern-apartment',
    description: 'A modern apartment design',
    status: 'published',
    propertyTypeSlug: 'apartment',
    propertySubtypeSlug: null,
    scopeSlug: 'full-home',
    bhkSlug: '3-bhk',
    sizeSqft: 1200,
    citySlug: 'mumbai',
    localitySlug: 'bandra',
    buildingName: null,
    budgetBandSlug: '10-20l',
    coverImageId: 'cover-img-1',
    completedMonth: '2025-06',
    durationMonths: 4,
    metadata: {},
    publishedAt: new Date('2025-06-01'),
    submittedAt: new Date('2025-05-15'),
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-06-01'),
    ...overrides,
  } as ProjectRecord;
}

function makeRoom(overrides: Partial<ProjectRoomRecord> = {}): ProjectRoomRecord {
  return {
    id: 'room-1',
    projectId: 'project-1',
    roomTypeId: 'room-type-1',
    name: 'Living Room',
    description: null,
    sortOrder: 0,
    metadata: {},
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    ...overrides,
  } as ProjectRoomRecord;
}

function makeFeedRow(overrides: Partial<ProjectFeedItemRecord> = {}): ProjectFeedItemRecord {
  return {
    id: 'project-1',
    slug: 'modern-apartment',
    title: 'Modern Apartment',
    citySlug: 'mumbai',
    localitySlug: 'bandra',
    budgetBandSlug: '10-20l',
    scopeSlug: 'full-home',
    bhkSlug: '3-bhk',
    propertySubtypeSlug: null,
    studio: 'Studio A',
    rating: '4.5',
    reviewCount: 10,
    coverImageId: '22222222-2222-4222-8222-222222222222',
    coverStatus: 'ready',
    coverDerivatives: [
      { variant: 'thumb', format: 'webp', key: 'derivatives/thumb.webp', width: 400, height: 300 },
    ],
    coverWidth: 400,
    coverHeight: 300,
    sizeSqft: 1200,
    completedMonth: '2025-03',
    publishedAt: new Date('2025-06-01'),
    ...overrides,
  };
}

// =============================================================================
// getPublicBySlug
// =============================================================================

describe('projectsService.getPublicBySlug', () => {
  it('returns 404 when slug not found (unknown slug)', async () => {
    vi.mocked(projectsRepository.findPublicProjectBySlug).mockResolvedValue(null);

    await expect(projectsService.getPublicBySlug('nonexistent')).rejects.toMatchObject({
      status: 404,
    });
  });

  it('returns 404 when project not published (filtered by repo query)', async () => {
    // The repository already filters status=published, so null = not found
    vi.mocked(projectsRepository.findPublicProjectBySlug).mockResolvedValue(null);

    await expect(projectsService.getPublicBySlug('draft-project')).rejects.toMatchObject({
      status: 404,
    });
  });

  it('returns 404 when designer is inactive (filtered by repo query)', async () => {
    vi.mocked(projectsRepository.findPublicProjectBySlug).mockResolvedValue(null);

    await expect(
      projectsService.getPublicBySlug('inactive-designer-project'),
    ).rejects.toMatchObject({
      status: 404,
    });
  });

  it('returns project with rooms, gallery, cover URL, and designer on success', async () => {
    vi.mocked(projectsRepository.findPublicProjectBySlug).mockResolvedValue({
      project: makeProject(),
      designer: {
        id: 'designer-1',
        displayName: 'Studio A',
        orgSlug: 'studio-a',
        avgRating: '4.5',
        reviewCount: 10,
        entityType: 'individual',
        logoImageId: 'logos/studio-a/logo.png',
      },
    });
    vi.mocked(projectsRepository.listRooms).mockResolvedValue([makeRoom()]);
    vi.mocked(projectsRepository.listPublicGalleryImages).mockResolvedValue([
      {
        id: 'img-1',
        derivatives: [
          { variant: 'large', format: 'webp', key: 'deriv/large.webp', width: 1200, height: 900 },
        ],
        width: 1200,
        height: 900,
        sortOrder: 0,
        roomName: 'Living Room',
      },
    ]);
    vi.mocked(projectsRepository.findCoverImages).mockResolvedValue(
      new Map([
        [
          'cover-img-1',
          {
            id: 'cover-img-1',
            status: 'ready',
            derivatives: [
              {
                variant: 'thumb',
                format: 'webp',
                key: 'deriv/cover.webp',
                width: 400,
                height: 300,
              },
            ],
          },
        ],
      ]),
    );

    const result = await projectsService.getPublicBySlug('modern-apartment');

    expect(result.title).toBe('Modern Apartment');
    expect(result.slug).toBe('modern-apartment');
    expect(result.rooms).toHaveLength(1);
    expect(result.rooms[0]?.name).toBe('Living Room');
    expect(result.images).toHaveLength(1);
    expect(result.images[0]?.url).toContain('signed.example');
    expect(result.coverImageUrl).toContain('signed.example');
    expect(result.designer.displayName).toBe('Studio A');
    expect(result.designer.slug).toBe('studio-a');
    expect(result.designer.logoUrl).toContain('signed.example');
  });

  it('returns null coverImageUrl when cover image is missing', async () => {
    vi.mocked(projectsRepository.findPublicProjectBySlug).mockResolvedValue({
      project: makeProject({ coverImageId: null }),
      designer: {
        id: 'designer-1',
        displayName: 'Studio A',
        orgSlug: 'studio-a',
        avgRating: '4.5',
        reviewCount: 10,
        entityType: 'individual',
        logoImageId: null,
      },
    });
    vi.mocked(projectsRepository.listRooms).mockResolvedValue([]);
    vi.mocked(projectsRepository.listPublicGalleryImages).mockResolvedValue([]);
    vi.mocked(projectsRepository.findCoverImages).mockResolvedValue(new Map());

    const result = await projectsService.getPublicBySlug('modern-apartment');

    expect(result.coverImageUrl).toBeNull();
    expect(result.designer.logoUrl).toBeNull();
    expect(result.images).toEqual([]);
    expect(result.rooms).toEqual([]);
  });
});

// =============================================================================
// getPublicImageDetail
// =============================================================================

describe('projectsService.getPublicImageDetail', () => {
  it('returns 404 when the image is not public', async () => {
    vi.mocked(projectsRepository.findPublishedFeedProjectByImageId).mockResolvedValue(null);

    await expect(
      projectsService.getPublicImageDetail('22222222-2222-4222-8222-222222222222'),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('returns the active image with published project context and gallery URLs', async () => {
    const activeImageId = '22222222-2222-4222-8222-222222222222';
    vi.mocked(projectsRepository.findPublishedFeedProjectByImageId).mockResolvedValue(
      makeFeedRow({
        id: '11111111-1111-4111-8111-111111111111',
        coverDerivatives: [
          {
            variant: 'thumb',
            format: 'webp',
            key: 'deriv/cover.webp',
            width: 400,
            height: 300,
          },
        ],
      }),
    );
    vi.mocked(projectsRepository.findTaxonomyLabels).mockResolvedValue(
      new Map([
        ['city:mumbai', 'Mumbai'],
        ['bhk:3-bhk', '3 BHK'],
        ['scope:full-home', 'Full Home'],
      ]),
    );
    vi.mocked(projectsRepository.findLocalityLabels).mockResolvedValue(
      new Map([['mumbai:bandra', 'Bandra']]),
    );
    vi.mocked(projectsRepository.listPublicGalleryImages).mockResolvedValue([
      {
        id: activeImageId,
        derivatives: [
          {
            variant: 'large',
            format: 'webp',
            key: 'deriv/living.webp',
            width: 1200,
            height: 900,
          },
        ],
        width: 1200,
        height: 900,
        sortOrder: 0,
        roomName: 'Living Room',
      },
    ]);

    const result = await projectsService.getPublicImageDetail(activeImageId);

    expect(result.activeImageId).toBe(activeImageId);
    expect(result.project.id).toBe('11111111-1111-4111-8111-111111111111');
    expect(result.project.city).toBe('Mumbai');
    expect(result.project.locality).toBe('Bandra');
    expect(result.project.coverImageUrl).toContain('signed.example/deriv/cover.webp');
    expect(result.images).toEqual([
      {
        id: activeImageId,
        url: 'https://signed.example/deriv/living.webp',
        width: 1200,
        height: 900,
        roomName: 'Living Room',
      },
    ]);
  });

  it('returns 404 when the active image cannot be signed into the gallery', async () => {
    vi.mocked(projectsRepository.findPublishedFeedProjectByImageId).mockResolvedValue(
      makeFeedRow(),
    );
    vi.mocked(projectsRepository.findTaxonomyLabels).mockResolvedValue(new Map());
    vi.mocked(projectsRepository.findLocalityLabels).mockResolvedValue(new Map());
    vi.mocked(projectsRepository.listPublicGalleryImages).mockResolvedValue([]);

    await expect(
      projectsService.getPublicImageDetail('22222222-2222-4222-8222-222222222222'),
    ).rejects.toMatchObject({ status: 404 });
  });
});

// =============================================================================
// designerProjects
// =============================================================================

describe('projectsService.designerProjects', () => {
  it('returns 404 when designer not found', async () => {
    vi.mocked(projectsRepository.findDesignerById).mockResolvedValue(null);

    await expect(
      projectsService.designerProjects('nonexistent', { page: 1, limit: 12 }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('returns 404 when designer is inactive', async () => {
    vi.mocked(projectsRepository.findDesignerById).mockResolvedValue({
      id: 'd1',
      status: 'suspended',
    });

    await expect(
      projectsService.designerProjects('d1', { page: 1, limit: 12 }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('returns empty projects when designer has no published work', async () => {
    vi.mocked(projectsRepository.findDesignerById).mockResolvedValue({
      id: 'd1',
      status: 'active',
    });
    vi.mocked(projectsRepository.listPublishedByDesigner).mockResolvedValue([]);
    vi.mocked(projectsRepository.findTaxonomyLabels).mockResolvedValue(new Map());
    vi.mocked(projectsRepository.findLocalityLabels).mockResolvedValue(new Map());

    const result = await projectsService.designerProjects('d1', { page: 1, limit: 12 });

    expect(result.projects).toEqual([]);
    expect(result.hasMore).toBe(false);
  });

  it('returns paginated projects with hasMore=true', async () => {
    vi.mocked(projectsRepository.findDesignerById).mockResolvedValue({
      id: 'd1',
      status: 'active',
    });
    // Return limit+1 rows to indicate hasMore
    vi.mocked(projectsRepository.listPublishedByDesigner).mockResolvedValue(
      Array.from({ length: 13 }, (_, i) => makeFeedRow({ id: `p-${i}`, slug: `project-${i}` })),
    );
    vi.mocked(projectsRepository.findTaxonomyLabels).mockResolvedValue(
      new Map([
        ['city:mumbai', 'Mumbai'],
        ['bhk:3-bhk', '3 BHK'],
        ['scope:full-home', 'Full Home'],
      ]),
    );
    vi.mocked(projectsRepository.findLocalityLabels).mockResolvedValue(
      new Map([['mumbai:bandra', 'Bandra']]),
    );

    const result = await projectsService.designerProjects('d1', { page: 1, limit: 12 });

    expect(result.projects).toHaveLength(12); // limit+1 trimmed to limit
    expect(result.hasMore).toBe(true);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(12);
  });

  it('returns hasMore=false when fewer results than limit', async () => {
    vi.mocked(projectsRepository.findDesignerById).mockResolvedValue({
      id: 'd1',
      status: 'active',
    });
    vi.mocked(projectsRepository.listPublishedByDesigner).mockResolvedValue([makeFeedRow()]);
    vi.mocked(projectsRepository.findTaxonomyLabels).mockResolvedValue(new Map());
    vi.mocked(projectsRepository.findLocalityLabels).mockResolvedValue(new Map());

    const result = await projectsService.designerProjects('d1', { page: 1, limit: 12 });

    expect(result.projects).toHaveLength(1);
    expect(result.hasMore).toBe(false);
  });

  it('adds the portfolio card fields the public gallery renders and sorts on', async () => {
    vi.mocked(projectsRepository.findDesignerById).mockResolvedValue({
      id: 'd1',
      status: 'active',
    });
    vi.mocked(projectsRepository.listPublishedByDesigner).mockResolvedValue([
      makeFeedRow({ propertySubtypeSlug: 'apartment', sizeSqft: 2400, completedMonth: '2024-06' }),
    ]);
    vi.mocked(projectsRepository.findTaxonomyLabels).mockResolvedValue(
      new Map([
        ['bhk:3-bhk', '3 BHK'],
        ['property_subtype:apartment', 'Apartment'],
      ]),
    );
    vi.mocked(projectsRepository.findLocalityLabels).mockResolvedValue(new Map());

    const result = await projectsService.designerProjects('d1', { page: 1, limit: 12 });

    expect(result.projects[0]).toMatchObject({
      propertyType: '3 BHK · Apartment',
      completionYear: 2024,
      sizeSqft: 2400,
    });
  });

  it('falls back to the publish year when completedMonth is unset', async () => {
    vi.mocked(projectsRepository.findDesignerById).mockResolvedValue({
      id: 'd1',
      status: 'active',
    });
    vi.mocked(projectsRepository.listPublishedByDesigner).mockResolvedValue([
      makeFeedRow({ completedMonth: null, publishedAt: new Date('2023-11-02T00:00:00.000Z') }),
    ]);
    vi.mocked(projectsRepository.findTaxonomyLabels).mockResolvedValue(new Map());
    vi.mocked(projectsRepository.findLocalityLabels).mockResolvedValue(new Map());

    const result = await projectsService.designerProjects('d1', { page: 1, limit: 12 });

    expect(result.projects[0]?.completionYear).toBe(2023);
  });

  it('parses a free-text completedMonth and reports null when there is no year at all', async () => {
    vi.mocked(projectsRepository.findDesignerById).mockResolvedValue({
      id: 'd1',
      status: 'active',
    });
    vi.mocked(projectsRepository.listPublishedByDesigner).mockResolvedValue([
      makeFeedRow({ id: 'p-free', completedMonth: 'June 2022' }),
      makeFeedRow({ id: 'p-none', completedMonth: 'sometime', publishedAt: null }),
    ]);
    vi.mocked(projectsRepository.findTaxonomyLabels).mockResolvedValue(new Map());
    vi.mocked(projectsRepository.findLocalityLabels).mockResolvedValue(new Map());

    const result = await projectsService.designerProjects('d1', { page: 1, limit: 12 });

    expect(result.projects[0]?.completionYear).toBe(2022);
    expect(result.projects[1]?.completionYear).toBeNull();
  });

  it('reports a null propertyType when neither taxonomy label resolves', async () => {
    vi.mocked(projectsRepository.findDesignerById).mockResolvedValue({
      id: 'd1',
      status: 'active',
    });
    vi.mocked(projectsRepository.listPublishedByDesigner).mockResolvedValue([
      makeFeedRow({ bhkSlug: null, propertySubtypeSlug: null }),
    ]);
    vi.mocked(projectsRepository.findTaxonomyLabels).mockResolvedValue(new Map());
    vi.mocked(projectsRepository.findLocalityLabels).mockResolvedValue(new Map());

    const result = await projectsService.designerProjects('d1', { page: 1, limit: 12 });

    expect(result.projects[0]?.propertyType).toBeNull();
  });

  it('skips the designer lookup when the caller already verified the profile', async () => {
    vi.mocked(projectsRepository.listPublishedByDesigner).mockResolvedValue([]);
    vi.mocked(projectsRepository.findTaxonomyLabels).mockResolvedValue(new Map());
    vi.mocked(projectsRepository.findLocalityLabels).mockResolvedValue(new Map());

    await projectsService.designerProjects(
      'd1',
      { page: 1, limit: 12 },
      { skipDesignerCheck: true },
    );

    expect(projectsRepository.findDesignerById).not.toHaveBeenCalled();
  });
});

// =============================================================================
// similarProjects
// =============================================================================

describe('projectsService.similarProjects', () => {
  it('returns 404 when source project not found', async () => {
    vi.mocked(projectsRepository.findById).mockResolvedValue(null);

    await expect(projectsService.similarProjects('nonexistent')).rejects.toMatchObject({
      status: 404,
    });
  });

  it('returns 404 when source project is not published', async () => {
    vi.mocked(projectsRepository.findById).mockResolvedValue(makeProject({ status: 'draft' }));

    await expect(projectsService.similarProjects('project-1')).rejects.toMatchObject({
      status: 404,
    });
  });

  it('returns empty when no similar projects exist', async () => {
    vi.mocked(projectsRepository.findById).mockResolvedValue(makeProject());
    vi.mocked(projectsRepository.findSimilarPublished).mockResolvedValue([]);
    vi.mocked(projectsRepository.findTaxonomyLabels).mockResolvedValue(new Map());
    vi.mocked(projectsRepository.findLocalityLabels).mockResolvedValue(new Map());

    const result = await projectsService.similarProjects('project-1');

    expect(result.projects).toEqual([]);
  });

  it('returns similar projects with feed card projection', async () => {
    vi.mocked(projectsRepository.findById).mockResolvedValue(makeProject());
    vi.mocked(projectsRepository.findSimilarPublished).mockResolvedValue([
      makeFeedRow({ id: 'similar-1', slug: 'similar-project' }),
    ]);
    vi.mocked(projectsRepository.findTaxonomyLabels).mockResolvedValue(
      new Map([['city:mumbai', 'Mumbai']]),
    );
    vi.mocked(projectsRepository.findLocalityLabels).mockResolvedValue(new Map());

    const result = await projectsService.similarProjects('project-1');

    expect(result.projects).toHaveLength(1);
    expect(result.projects[0]?.slug).toBe('similar-project');
    expect(result.projects[0]?.city).toBe('Mumbai');
  });

  it('passes correct criteria to repository (city + scope + budget + bhk)', async () => {
    const project = makeProject({
      citySlug: 'pune',
      scopeSlug: 'modular-kitchen',
      budgetBandSlug: '20-50l',
      bhkSlug: '2-bhk',
    });
    vi.mocked(projectsRepository.findById).mockResolvedValue(project);
    vi.mocked(projectsRepository.findSimilarPublished).mockResolvedValue([]);
    vi.mocked(projectsRepository.findTaxonomyLabels).mockResolvedValue(new Map());
    vi.mocked(projectsRepository.findLocalityLabels).mockResolvedValue(new Map());

    await projectsService.similarProjects('project-1');

    expect(projectsRepository.findSimilarPublished).toHaveBeenCalledWith(project, 8);
  });
});
