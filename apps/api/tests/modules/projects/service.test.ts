import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppError } from '../../../src/lib/errors.js';
import type {
  ProjectFeedItemRecord,
  ProjectImageAttachmentRecord,
  ProjectImageDeletionRecord,
  ProjectRecord,
  ProjectReviewCommentRecord,
  ProjectRoomRecord,
} from '../../../src/modules/projects/repository.js';

vi.mock('@repo/storage', () => ({
  deleteObject: vi.fn(async () => undefined),
  presignDownload: vi.fn(async ({ key }: { key: string }) => `https://signed.example/${key}`),
}));

// Replace the Drizzle-backed repository with a fake. This is what makes the
// service unit-testable with NO database — the payoff of the layering rule.
vi.mock('../../../src/modules/projects/repository.js', () => {
  return {
    projectsRepository: {
      list: vi.fn(),
      countByStatus: vi.fn(),
      findCoverImages: vi.fn(),
      findById: vi.fn(),
      findByIdWithRooms: vi.fn(),
      findBySlug: vi.fn(),
      createDraft: vi.fn(),
      duplicateProject: vi.fn(),
      updateDraft: vi.fn(),
      deleteProject: vi.fn(),
      findDesignerByOrgId: vi.fn(),
      findOwnership: vi.fn(),
      taxonomyExists: vi.fn(),
      findTaxonomyTermBySlug: vi.fn(),
      propertySubtypeExists: vi.fn(),
      localityExists: vi.fn(),
      listRooms: vi.fn(),
      findRoom: vi.fn(),
      createRoom: vi.fn(),
      findRoomTypesBySlugs: vi.fn(),
      createRooms: vi.fn(),
      updateRoom: vi.fn(),
      reorderRooms: vi.fn(),
      deleteRoom: vi.fn(),
      findImage: vi.fn(),
      updateImageLink: vi.fn(),
      deleteImage: vi.fn(),
      getUploadImageCounts: vi.fn(),
      submitWithUploadCounts: vi.fn(),
      transition: vi.fn(),
      listModerationHistory: vi.fn(),
      listReviewComments: vi.fn(),
      listUnresolvedReviewComments: vi.fn(),
      findReferencedImageObjectKeys: vi.fn(),
      listPublishedFeed: vi.fn(),
      findTaxonomyLabels: vi.fn(),
      findLocalityLabels: vi.fn(),
      // keep the real-ish slugify so create() behavior is realistic
      slugify: (t: string) =>
        t
          .toLowerCase()
          .trim()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 80) || 'project',
    },
  };
});

vi.mock('../../../src/modules/orgs/service.js', () => ({
  orgsService: {
    isMember: vi.fn(),
    isWriter: vi.fn(),
  },
}));

// Import AFTER the mock is registered.
const { assertTransition, projectsService } =
  await import('../../../src/modules/projects/service.js');
const { projectsRepository } = await import('../../../src/modules/projects/repository.js');
const { orgsService } = await import('../../../src/modules/orgs/service.js');
const { deleteObject } = await import('@repo/storage');

const row = (over: Partial<ProjectRecord> = {}): ProjectRecord => ({
  id: '11111111-1111-4111-8111-111111111111',
  designerId: '22222222-2222-4222-8222-222222222222',
  title: 'Sunlit Bandra Apartment',
  slug: 'sunlit-bandra-apartment',
  description: null,
  status: 'published',
  propertyTypeSlug: null,
  propertySubtypeSlug: null,
  scopeSlug: null,
  bhkSlug: null,
  sizeSqft: null,
  citySlug: 'mumbai',
  localitySlug: null,
  buildingName: null,
  budgetBandSlug: null,
  coverImageId: null,
  completedMonth: null,
  durationMonths: null,
  metadata: {},
  publishedAt: null,
  submittedAt: null,
  reviewedBy: null,
  reviewStartedAt: null,
  rejectionReasonCode: null,
  moderationNote: null,
  featuredAt: null,
  moderationRevision: 0,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  ...over,
});

const roomRow = (over: Partial<ProjectRoomRecord> = {}): ProjectRoomRecord => ({
  id: '33333333-3333-4333-8333-333333333333',
  projectId: '11111111-1111-4111-8111-111111111111',
  roomTypeId: '44444444-4444-4444-8444-444444444444',
  name: 'Living Room',
  description: null,
  sortOrder: 0,
  metadata: {},
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  ...over,
});

const imageRow = (
  over: Partial<ProjectImageAttachmentRecord> = {},
): ProjectImageAttachmentRecord => ({
  id: '55555555-5555-4555-8555-555555555555',
  projectId: '11111111-1111-4111-8111-111111111111',
  roomId: null,
  status: 'processing',
  sortOrder: 0,
  ...over,
});

const deletedImageRow = (
  over: Partial<ProjectImageDeletionRecord> = {},
): ProjectImageDeletionRecord => ({
  id: '55555555-5555-4555-8555-555555555555',
  projectId: '11111111-1111-4111-8111-111111111111',
  originalKey: 'originals/project/image',
  derivatives: [
    {
      variant: 'thumb',
      format: 'webp',
      key: 'derivatives/project/image/thumb.webp',
      width: 320,
      height: 240,
    },
    {
      variant: 'large',
      format: 'avif',
      key: 'derivatives/project/image/large.avif',
      width: 1600,
      height: 1200,
    },
  ],
  ...over,
});

const caller = {
  userId: '99999999-9999-4999-8999-999999999999',
  userRole: 'designer',
  isBanned: false,
  activeOrgId: 'org_1',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(projectsRepository.findReferencedImageObjectKeys).mockResolvedValue([]);
  vi.mocked(projectsRepository.listReviewComments).mockResolvedValue([]);
  vi.mocked(projectsRepository.listUnresolvedReviewComments).mockResolvedValue([]);
  vi.mocked(orgsService.isMember).mockResolvedValue(true);
  vi.mocked(orgsService.isWriter).mockResolvedValue(true);
});

describe('projectsService.list', () => {
  it('maps owner rows to the dashboard response shape and passes filters through', async () => {
    vi.mocked(projectsRepository.list).mockResolvedValue({ items: [row()], total: 1 });
    vi.mocked(projectsRepository.findCoverImages).mockResolvedValue(new Map());

    const result = await projectsService.list(
      { status: 'draft', q: 'bandra', page: 2, limit: 20, sort: '-updatedAt' },
      caller,
    );

    expect(projectsRepository.list).toHaveBeenCalledWith({
      userId: caller.userId,
      activeOrgId: 'org_1',
      statuses: ['draft', 'changes_requested', 'rejected'],
      q: 'bandra',
      limit: 20,
      offset: 20,
      sort: '-updatedAt',
    });
    expect(projectsRepository.findCoverImages).toHaveBeenCalledWith([]);
    expect(result.total).toBe(1);
    expect(result).toMatchObject({ page: 2, limit: 20, totalPages: 1 });
    expect(result.items[0]).toMatchObject({ slug: 'sunlit-bandra-apartment', status: 'published' });
    // Date is serialized to an ISO string at the boundary.
    expect(result.items[0]!.createdAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('surfaces only unresolved comments for changes-requested list rows', async () => {
    const project = row({ status: 'changes_requested' });
    const comment: ProjectReviewCommentRecord = {
      id: '22222222-2222-4222-8222-222222222222',
      projectId: project.id,
      authorId: 'admin-1',
      body: 'Add a wider kitchen photo.',
      status: 'unresolved',
      createdAt: new Date('2026-08-04T08:00:00.000Z'),
      updatedAt: new Date('2026-08-04T08:00:00.000Z'),
    };
    vi.mocked(projectsRepository.list).mockResolvedValue({ items: [project], total: 1 });
    vi.mocked(projectsRepository.findCoverImages).mockResolvedValue(new Map());
    vi.mocked(projectsRepository.listUnresolvedReviewComments).mockResolvedValue([comment]);

    const result = await projectsService.list(
      { status: 'draft', page: 1, limit: 12, sort: '-updatedAt' },
      caller,
    );

    expect(projectsRepository.listUnresolvedReviewComments).toHaveBeenCalledWith([project.id]);
    expect(result.items[0]?.reviewComments).toEqual([
      expect.objectContaining({
        id: comment.id,
        authorLabel: 'Tickif Review Team',
        status: 'unresolved',
      }),
    ]);
  });

  it('rejects listing without an active organization', async () => {
    await expect(
      projectsService.list(
        { status: 'all', page: 1, limit: 20, sort: '-updatedAt' },
        { ...caller, activeOrgId: null },
      ),
    ).rejects.toMatchObject({ status: 422 });
    expect(projectsRepository.list).not.toHaveBeenCalled();
  });
});

describe('projectsService.portfolio', () => {
  it('returns exact status groups, counts, and representative cover media', async () => {
    const coverId = '55555555-5555-4555-8555-555555555555';
    vi.mocked(projectsRepository.list).mockResolvedValue({
      items: [row({ status: 'changes_requested', coverImageId: coverId })],
      total: 1,
    });
    vi.mocked(projectsRepository.countByStatus).mockResolvedValue([
      { status: 'draft', count: 2 },
      { status: 'submitted', count: 1 },
      { status: 'in_review', count: 2 },
      { status: 'published', count: 1 },
      { status: 'changes_requested', count: 3 },
      { status: 'rejected', count: 1 },
    ]);
    vi.mocked(projectsRepository.findCoverImages).mockResolvedValue(
      new Map([
        [
          coverId,
          {
            id: coverId,
            status: 'ready',
            derivatives: [
              {
                variant: 'thumb',
                format: 'webp',
                key: 'derivatives/project/cover/thumb.webp',
                width: 320,
                height: 240,
              },
            ],
          },
        ],
      ]),
    );

    const result = await projectsService.portfolio(
      { status: 'changes_requested', page: 1, limit: 12, sort: '-updatedAt' },
      caller,
    );

    expect(projectsRepository.list).toHaveBeenCalledWith({
      userId: caller.userId,
      activeOrgId: 'org_1',
      statuses: ['changes_requested'],
      limit: 12,
      offset: 0,
      sort: '-updatedAt',
    });
    expect(result.statusCounts).toEqual({
      total: 10,
      draft: 2,
      inReview: 3,
      published: 1,
      changesRequested: 3,
      rejected: 1,
    });
    expect(result.items[0]).toMatchObject({
      status: 'changes_requested',
      statusGroup: 'changes_requested',
      coverImage: {
        id: coverId,
        url: 'https://signed.example/derivatives/project/cover/thumb.webp',
        width: 320,
        height: 240,
      },
    });
  });

  it('rejects banned callers before touching the repository', async () => {
    await expect(
      projectsService.portfolio(
        { status: 'all', page: 1, limit: 12, sort: '-updatedAt' },
        { ...caller, isBanned: true },
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(projectsRepository.list).not.toHaveBeenCalled();
    expect(projectsRepository.countByStatus).not.toHaveBeenCalled();
  });

  it('rejects portfolio listing without an active organization', async () => {
    await expect(
      projectsService.portfolio(
        { status: 'all', page: 1, limit: 12, sort: '-updatedAt' },
        { ...caller, activeOrgId: null },
      ),
    ).rejects.toMatchObject({ status: 422 });
    expect(projectsRepository.list).not.toHaveBeenCalled();
    expect(projectsRepository.countByStatus).not.toHaveBeenCalled();
  });

  it('nulls cover media when the cover image is not ready or has no derivatives', async () => {
    const processingCoverId = '66666666-6666-4666-8666-666666666666';
    const bareCoverId = '77777777-7777-4777-8777-777777777777';
    vi.mocked(projectsRepository.list).mockResolvedValue({
      items: [
        row({ id: '11111111-1111-4111-8111-111111111112', coverImageId: processingCoverId }),
        row({ id: '11111111-1111-4111-8111-111111111113', coverImageId: bareCoverId }),
      ],
      total: 2,
    });
    vi.mocked(projectsRepository.countByStatus).mockResolvedValue([
      { status: 'published', count: 2 },
    ]);
    vi.mocked(projectsRepository.findCoverImages).mockResolvedValue(
      new Map([
        [
          processingCoverId,
          {
            id: processingCoverId,
            status: 'processing',
            derivatives: [
              {
                variant: 'thumb',
                format: 'webp',
                key: 'derivatives/project/cover/thumb.webp',
                width: 320,
                height: 240,
              },
            ],
          },
        ],
        [bareCoverId, { id: bareCoverId, status: 'ready', derivatives: [] }],
      ]),
    );

    const result = await projectsService.portfolio(
      { status: 'all', page: 1, limit: 12, sort: '-updatedAt' },
      caller,
    );

    expect(result.items.map((item) => item.coverImage)).toEqual([null, null]);
    expect(result.items.map((item) => item.coverImageUrl)).toEqual([null, null]);
  });
});

describe('projectsService.getById', () => {
  it('throws AppError(404) when the project is missing', async () => {
    vi.mocked(projectsRepository.findByIdWithRooms).mockResolvedValue(null);

    await expect(projectsService.getById('missing')).rejects.toBeInstanceOf(AppError);
    await expect(projectsService.getById('missing')).rejects.toMatchObject({ status: 404 });
  });
});

describe('projectsService.create', () => {
  it('rejects callers without the designer role before resolving an organization', async () => {
    await expect(
      projectsService.create(
        { title: 'Visitor Project' },
        { ...caller, userRole: 'visitor', activeOrgId: null },
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(orgsService.isWriter).not.toHaveBeenCalled();
  });

  it('uses the base slug when free', async () => {
    vi.mocked(projectsRepository.findBySlug).mockResolvedValue(null);
    vi.mocked(projectsRepository.findDesignerByOrgId).mockResolvedValue({
      id: '22222222-2222-4222-8222-222222222222',
      orgId: 'org_1',
    });
    vi.mocked(projectsRepository.createDraft).mockImplementation(
      async (_input, _designerId, slug) => row({ slug }),
    );

    const created = await projectsService.create(
      {
        title: 'Sunlit Bandra Apartment',
      },
      caller,
    );

    expect(created.slug).toBe('sunlit-bandra-apartment');
  });

  it('appends a suffix when the slug already exists', async () => {
    vi.mocked(projectsRepository.findBySlug).mockResolvedValue(row());
    vi.mocked(projectsRepository.findDesignerByOrgId).mockResolvedValue({
      id: '22222222-2222-4222-8222-222222222222',
      orgId: 'org_1',
    });
    vi.mocked(projectsRepository.createDraft).mockImplementation(
      async (_input, _designerId, slug) => row({ slug }),
    );

    const created = await projectsService.create(
      {
        title: 'Sunlit Bandra Apartment',
      },
      caller,
    );

    expect(created.slug).not.toBe('sunlit-bandra-apartment');
    expect(created.slug).toMatch(/^sunlit-bandra-apartment-/);
  });

  it('retries slug creation when another draft wins the insert race', async () => {
    vi.mocked(projectsRepository.findBySlug).mockResolvedValue(null);
    vi.mocked(projectsRepository.findDesignerByOrgId).mockResolvedValue({
      id: '22222222-2222-4222-8222-222222222222',
      orgId: 'org_1',
    });
    vi.mocked(projectsRepository.createDraft)
      .mockRejectedValueOnce(Object.assign(new Error('duplicate'), { code: '23505' }))
      .mockImplementationOnce(async (_input, _designerId, slug) => row({ slug }));

    const created = await projectsService.create(
      {
        title: 'Sunlit Bandra Apartment',
      },
      caller,
    );

    expect(projectsRepository.createDraft).toHaveBeenCalledTimes(2);
    expect(created.slug).toMatch(/^sunlit-bandra-apartment-/);
  });

  it('generates a title and room prefill when title is omitted', async () => {
    vi.mocked(projectsRepository.findBySlug).mockResolvedValue(null);
    vi.mocked(projectsRepository.findDesignerByOrgId).mockResolvedValue({
      id: '22222222-2222-4222-8222-222222222222',
      orgId: 'org_1',
    });
    vi.mocked(projectsRepository.taxonomyExists).mockResolvedValue(true);
    vi.mocked(projectsRepository.propertySubtypeExists).mockResolvedValue(true);
    vi.mocked(projectsRepository.findTaxonomyTermBySlug).mockImplementation(
      async (_kind, slug) => ({
        id: `term-${slug}`,
        kind: _kind,
        slug,
        label:
          {
            bengaluru: 'Bengaluru',
            apartment: 'Apartment / flat',
            '2-bhk': '2 BHK',
            luxury: 'Luxury',
          }[slug] ?? slug,
        metadata:
          slug === 'apartment'
            ? {
                propertyTypeSlug: 'residential',
                defaultRoomSlugs: ['kitchen', 'bedroom', 'bathroom'],
              }
            : {},
      }),
    );
    vi.mocked(projectsRepository.createDraft).mockImplementation(async (input, _designerId, slug) =>
      row({
        title: input.title,
        slug,
        propertyTypeSlug: input.propertyTypeSlug ?? null,
        propertySubtypeSlug: input.propertySubtypeSlug ?? null,
        bhkSlug: input.bhkSlug ?? null,
        citySlug: input.citySlug ?? null,
        buildingName: input.buildingName ?? null,
        budgetBandSlug: input.budgetBandSlug ?? null,
        status: 'draft',
      }),
    );
    vi.mocked(projectsRepository.findRoomTypesBySlugs).mockResolvedValue([
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        kind: 'room',
        slug: 'kitchen',
        label: 'Kitchen',
        metadata: {},
      },
      {
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        kind: 'room',
        slug: 'bedroom',
        label: 'Bedroom',
        metadata: {},
      },
      {
        id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        kind: 'room',
        slug: 'bathroom',
        label: 'Bathroom',
        metadata: {},
      },
    ]);
    vi.mocked(projectsRepository.createRooms).mockResolvedValue([
      roomRow({ name: 'Kitchen', sortOrder: 0 }),
      roomRow({ name: 'Master Bedroom', sortOrder: 1 }),
      roomRow({ name: 'Bedroom 2', sortOrder: 2 }),
      roomRow({ name: 'Bathroom', sortOrder: 3 }),
    ]);

    const created = await projectsService.create(
      {
        buildingName: 'Maitri Apartments',
        propertyTypeSlug: 'residential',
        propertySubtypeSlug: 'apartment',
        bhkSlug: '2-bhk',
        citySlug: 'bengaluru',
        budgetBandSlug: 'luxury',
      },
      caller,
    );

    expect(created.title).toBe('Maitri Apartments - 2 BHK Luxury Apartment / flat in Bengaluru');
    expect(created.rooms.map((room) => room.name)).toEqual([
      'Kitchen',
      'Master Bedroom',
      'Bedroom 2',
      'Bathroom',
    ]);
  });

  it('requires the authenticated user to have a designer profile', async () => {
    vi.mocked(projectsRepository.findDesignerByOrgId).mockResolvedValue(null);

    await expect(projectsService.create({ title: 'New Project' }, caller)).rejects.toMatchObject({
      status: 403,
    });
  });

  it('creates in the active organization and rejects a missing active organization', async () => {
    vi.mocked(projectsRepository.findBySlug).mockResolvedValue(null);
    vi.mocked(projectsRepository.findDesignerByOrgId).mockResolvedValue({
      id: '22222222-2222-4222-8222-222222222222',
      orgId: 'org_1',
    });
    vi.mocked(projectsRepository.createDraft).mockImplementation(
      async (_input, _designerId, slug) => row({ slug }),
    );

    await projectsService.create({ title: 'Active Org Project' }, caller);

    expect(orgsService.isWriter).toHaveBeenCalledWith(caller.userId, 'org_1');
    expect(projectsRepository.findDesignerByOrgId).toHaveBeenCalledWith('org_1');
    await expect(
      projectsService.create({ title: 'No Org Project' }, { ...caller, activeOrgId: null }),
    ).rejects.toMatchObject({ status: 422 });
  });
});

describe('projectsService.update', () => {
  it('allows changes-requested projects to be edited', async () => {
    vi.mocked(projectsRepository.findOwnership).mockResolvedValue({
      projectId: row().id,
      designerId: row().designerId,
      status: 'changes_requested',
      ownerUserId: caller.userId,
    });
    vi.mocked(projectsRepository.findById).mockResolvedValue(row({ status: 'changes_requested' }));
    vi.mocked(projectsRepository.updateDraft).mockResolvedValue(
      row({ status: 'changes_requested', title: 'Updated Requested Changes' }),
    );
    vi.mocked(projectsRepository.listRooms).mockResolvedValue([]);

    const result = await projectsService.update(
      row().id,
      { title: 'Updated Requested Changes' },
      caller,
    );

    expect(result.status).toBe('changes_requested');
    expect(result.title).toBe('Updated Requested Changes');
  });

  it('validates that the cover image belongs to the project', async () => {
    vi.mocked(projectsRepository.findOwnership).mockResolvedValue({
      projectId: row().id,
      designerId: row().designerId,
      status: 'draft',
      ownerUserId: caller.userId,
    });
    vi.mocked(projectsRepository.findById).mockResolvedValue(row({ status: 'draft' }));
    vi.mocked(projectsRepository.findImage).mockResolvedValue(null);

    await expect(
      projectsService.update(row().id, { coverImageId: imageRow().id }, caller),
    ).rejects.toMatchObject({ status: 422 });
  });
});

describe('projectsService.reorderRooms', () => {
  it('rejects room reorder payloads that reference another project', async () => {
    vi.mocked(projectsRepository.findOwnership).mockResolvedValue({
      projectId: row().id,
      designerId: row().designerId,
      status: 'draft',
      ownerUserId: caller.userId,
    });
    vi.mocked(projectsRepository.reorderRooms).mockResolvedValue(null);

    await expect(
      projectsService.reorderRooms(
        row().id,
        { rooms: [{ id: roomRow().id, sortOrder: 1 }] },
        caller,
      ),
    ).rejects.toMatchObject({ status: 422 });
  });
});

describe('projectsService.linkImage', () => {
  it('returns image not found before validating a bad room id', async () => {
    vi.mocked(projectsRepository.findOwnership).mockResolvedValue({
      projectId: row().id,
      designerId: row().designerId,
      status: 'draft',
      ownerUserId: caller.userId,
    });
    vi.mocked(projectsRepository.findImage).mockResolvedValue(null);

    await expect(
      projectsService.linkImage(row().id, imageRow().id, { roomId: roomRow().id }, caller),
    ).rejects.toMatchObject({ status: 404 });
    expect(projectsRepository.findRoom).not.toHaveBeenCalled();
  });
});

describe('projectsService.deleteImage', () => {
  it('deletes the DB image and best-effort cleans original and derivative objects', async () => {
    vi.mocked(projectsRepository.findOwnership).mockResolvedValue({
      projectId: row().id,
      designerId: row().designerId,
      status: 'draft',
      ownerUserId: caller.userId,
    });
    vi.mocked(projectsRepository.deleteImage).mockResolvedValue(deletedImageRow());

    await expect(projectsService.deleteImage(row().id, imageRow().id, caller)).resolves.toEqual({
      id: imageRow().id,
      deleted: true,
    });

    expect(deleteObject).toHaveBeenCalledWith('originals/project/image');
    expect(deleteObject).toHaveBeenCalledWith('derivatives/project/image/thumb.webp');
    expect(deleteObject).toHaveBeenCalledWith('derivatives/project/image/large.avif');
  });

  it('keeps shared storage objects when another image row still references them', async () => {
    vi.mocked(projectsRepository.findOwnership).mockResolvedValue({
      projectId: row().id,
      designerId: row().designerId,
      status: 'draft',
      ownerUserId: caller.userId,
    });
    vi.mocked(projectsRepository.deleteImage).mockResolvedValue(deletedImageRow());
    vi.mocked(projectsRepository.findReferencedImageObjectKeys).mockResolvedValue([
      'originals/project/image',
      'derivatives/project/image/thumb.webp',
    ]);

    await expect(projectsService.deleteImage(row().id, imageRow().id, caller)).resolves.toEqual({
      id: imageRow().id,
      deleted: true,
    });

    expect(deleteObject).not.toHaveBeenCalledWith('originals/project/image');
    expect(deleteObject).not.toHaveBeenCalledWith('derivatives/project/image/thumb.webp');
    expect(deleteObject).toHaveBeenCalledWith('derivatives/project/image/large.avif');
  });
});

describe('projectsService.getCompleteness', () => {
  it('reports missing dashboard upload requirements', async () => {
    vi.mocked(projectsRepository.findOwnership).mockResolvedValue({
      projectId: row().id,
      designerId: row().designerId,
      status: 'draft',
      ownerUserId: caller.userId,
    });
    vi.mocked(projectsRepository.findById).mockResolvedValue(row({ status: 'draft' }));
    vi.mocked(projectsRepository.getUploadImageCounts).mockResolvedValue({
      imageCount: 1,
      taggedImageCount: 0,
    });

    const result = await projectsService.getCompleteness(row().id, caller);

    expect(result.complete).toBe(false);
    expect(result.missing).toContain('property-type');
    expect(result.missing).toContain('at-least-three-photos');
    expect(
      result.requirements.find((requirement) => requirement.key === 'at-least-three-photos')?.label,
    ).toBe('At least 3 photos');
  });

  it('reports completeness for published projects without owner access', async () => {
    vi.mocked(projectsRepository.findById).mockResolvedValue(row({ status: 'published' }));
    vi.mocked(projectsRepository.getUploadImageCounts).mockResolvedValue({
      imageCount: 0,
      taggedImageCount: 0,
    });

    const result = await projectsService.getCompleteness(row().id, caller);

    expect(result.complete).toBe(false);
    expect(projectsRepository.findOwnership).not.toHaveBeenCalled();
  });
});

describe('projectsService.submit', () => {
  it('submits a complete draft and returns detail response', async () => {
    const complete = row({
      status: 'draft',
      citySlug: 'mumbai',
      propertyTypeSlug: 'residential',
      scopeSlug: 'full-home',
      budgetBandSlug: 'premium',
    });
    vi.mocked(projectsRepository.findOwnership).mockResolvedValue({
      projectId: complete.id,
      designerId: complete.designerId,
      status: 'draft',
      ownerUserId: caller.userId,
    });
    vi.mocked(projectsRepository.findById).mockResolvedValue(complete);
    vi.mocked(projectsRepository.submitWithUploadCounts).mockResolvedValue({
      project: complete,
      counts: { imageCount: 3, taggedImageCount: 3 },
      submitted: row({
        ...complete,
        status: 'submitted',
        submittedAt: new Date('2026-01-02T00:00:00Z'),
      }),
    });
    vi.mocked(projectsRepository.listRooms).mockResolvedValue([roomRow()]);

    const result = await projectsService.submit(complete.id, caller);

    expect(result.status).toBe('submitted');
    expect(result.submittedAt).toBe('2026-01-02T00:00:00.000Z');
    expect(result.rooms).toHaveLength(1);
  });

  it('resubmits a complete changes-requested project', async () => {
    const requestedChanges = row({
      status: 'changes_requested',
      citySlug: 'mumbai',
      propertyTypeSlug: 'residential',
      scopeSlug: 'full-home',
      budgetBandSlug: 'premium',
    });
    vi.mocked(projectsRepository.findOwnership).mockResolvedValue({
      projectId: requestedChanges.id,
      designerId: requestedChanges.designerId,
      status: 'changes_requested',
      ownerUserId: caller.userId,
    });
    vi.mocked(projectsRepository.findById).mockResolvedValue(requestedChanges);
    vi.mocked(projectsRepository.submitWithUploadCounts).mockResolvedValue({
      project: requestedChanges,
      counts: { imageCount: 3, taggedImageCount: 3 },
      submitted: row({
        ...requestedChanges,
        status: 'submitted',
        submittedAt: new Date('2026-01-02T00:00:00Z'),
      }),
    });
    vi.mocked(projectsRepository.listRooms).mockResolvedValue([roomRow()]);

    const result = await projectsService.submit(requestedChanges.id, caller);

    expect(result.status).toBe('submitted');
    expect(projectsRepository.submitWithUploadCounts).toHaveBeenCalledWith(requestedChanges.id, {
      minImageCount: 3,
      actorUserId: caller.userId,
      expectedStatus: 'changes_requested',
      // Derived from the transition matrix, not re-derived from expectedStatus.
      action: 'resubmit',
    });
  });

  it('resubmits a complete rejected project', async () => {
    const rejected = row({
      status: 'rejected',
      citySlug: 'mumbai',
      propertyTypeSlug: 'residential',
      scopeSlug: 'full-home',
      budgetBandSlug: 'premium',
      rejectionReasonCode: 'portfolio-mismatch',
      moderationNote: 'Portfolio mismatch.',
    });
    vi.mocked(projectsRepository.findOwnership).mockResolvedValue({
      projectId: rejected.id,
      designerId: rejected.designerId,
      status: 'rejected',
      ownerUserId: caller.userId,
    });
    vi.mocked(projectsRepository.findById).mockResolvedValue(rejected);
    vi.mocked(projectsRepository.submitWithUploadCounts).mockResolvedValue({
      project: rejected,
      counts: { imageCount: 3, taggedImageCount: 3 },
      submitted: row({
        ...rejected,
        status: 'submitted',
        submittedAt: new Date('2026-01-02T00:00:00Z'),
      }),
    });
    vi.mocked(projectsRepository.listRooms).mockResolvedValue([roomRow()]);

    const result = await projectsService.submit(rejected.id, caller);

    expect(result.status).toBe('submitted');
    expect(projectsRepository.submitWithUploadCounts).toHaveBeenCalledWith(rejected.id, {
      minImageCount: 3,
      actorUserId: caller.userId,
      expectedStatus: 'rejected',
      action: 'resubmit',
    });
  });

  it('rejects when the atomic submit recheck sees stale image counts', async () => {
    const complete = row({
      status: 'draft',
      citySlug: 'mumbai',
      propertyTypeSlug: 'residential',
      scopeSlug: 'full-home',
      budgetBandSlug: 'premium',
    });
    vi.mocked(projectsRepository.findOwnership).mockResolvedValue({
      projectId: complete.id,
      designerId: complete.designerId,
      status: 'draft',
      ownerUserId: caller.userId,
    });
    vi.mocked(projectsRepository.findById).mockResolvedValue(complete);
    vi.mocked(projectsRepository.submitWithUploadCounts).mockResolvedValue({
      project: complete,
      counts: { imageCount: 2, taggedImageCount: 2 },
      submitted: null,
    });

    await expect(projectsService.submit(complete.id, caller)).rejects.toMatchObject({
      status: 422,
    });
  });
});

describe('assertTransition', () => {
  const statuses = [
    'draft',
    'submitted',
    'in_review',
    'published',
    'rejected',
    'changes_requested',
  ] as const;
  const roles = ['visitor', 'designer', 'admin', 'superadmin'] as const;
  const allowed = new Map([
    ['designer:draft:submitted', 'submit'],
    ['designer:changes_requested:submitted', 'resubmit'],
    ['designer:rejected:submitted', 'resubmit'],
    ['designer:submitted:draft', 'withdraw'],
    ['admin:submitted:in_review', 'start_review'],
    ['admin:in_review:published', 'publish'],
    ['admin:in_review:changes_requested', 'request_changes'],
    ['admin:in_review:rejected', 'reject'],
    ['admin:published:in_review', 'unpublish'],
    ['superadmin:submitted:in_review', 'start_review'],
    ['superadmin:in_review:published', 'publish'],
    ['superadmin:in_review:changes_requested', 'request_changes'],
    ['superadmin:in_review:rejected', 'reject'],
    ['superadmin:published:in_review', 'unpublish'],
    ['superadmin:submitted:draft', 'withdraw'],
  ]);

  it('accepts only declared transitions and derives their audit actions', () => {
    for (const role of roles) {
      for (const fromStatus of statuses) {
        for (const toStatus of statuses) {
          const key = `${role}:${fromStatus}:${toStatus}`;
          const action = allowed.get(key);
          if (action) {
            expect(assertTransition(fromStatus, toStatus, role), key).toBe(action);
          } else {
            expect(() => assertTransition(fromStatus, toStatus, role), key).toThrowError(
              expect.objectContaining({ code: 'invalid_transition', status: 409 }),
            );
          }
        }
      }
    }
  });
});

describe('projectsService.feed', () => {
  const feedRow = (over: Partial<ProjectFeedItemRecord> = {}): ProjectFeedItemRecord => ({
    id: '11111111-1111-4111-8111-111111111111',
    slug: 'industrial-chic-apartment',
    title: 'Industrial Chic Apartment',
    citySlug: 'mumbai',
    localitySlug: 'bandra',
    budgetBandSlug: '3-5-lakh',
    scopeSlug: 'full-home',
    bhkSlug: '2-bhk',
    propertySubtypeSlug: null,
    studio: 'Studio Noir',
    rating: '4.70',
    reviewCount: 12,
    coverImageId: '22222222-2222-4222-8222-222222222222',
    coverStatus: 'ready',
    coverDerivatives: [
      {
        variant: 'thumb',
        format: 'webp',
        key: 'derivatives/cover/thumb.webp',
        width: 320,
        height: 240,
      },
    ],
    coverWidth: 480,
    coverHeight: 640,
    coverThemeSlugs: ['industrial'],
    sizeSqft: 1450,
    completedMonth: '2025-02',
    publishedAt: new Date('2025-04-01'),
    ...over,
  });

  it('maps rows to cards, resolving labels and signing the cover, with hasMore from limit+1', async () => {
    vi.mocked(projectsRepository.listPublishedFeed).mockResolvedValue([
      feedRow(),
      feedRow({ id: 'x' }),
    ]);
    vi.mocked(projectsRepository.findTaxonomyLabels).mockResolvedValue(
      new Map([
        ['city:mumbai', 'Mumbai'],
        ['budget_band:3-5-lakh', '₹3–5L'],
        ['bhk:2-bhk', '2 BHK'],
        ['scope:full-home', 'Full Home'],
      ]),
    );
    vi.mocked(projectsRepository.findLocalityLabels).mockResolvedValue(
      new Map([['mumbai:bandra', 'Bandra']]),
    );

    const result = await projectsService.feed({ page: 1, limit: 1 });

    // limit+1 fetched (2 rows), so only 1 returned and hasMore is true.
    expect(projectsRepository.listPublishedFeed).toHaveBeenCalledWith({ limit: 2, offset: 0 });
    expect(result).toMatchObject({ page: 1, limit: 1, hasMore: true });
    expect(result.projects).toHaveLength(1);
    expect(result.projects[0]).toMatchObject({
      studio: 'Studio Noir',
      city: 'Mumbai',
      locality: 'Bandra',
      budget: '₹3–5L',
      rating: 4.7,
      reviewCount: 12,
      tags: ['2 BHK', 'Full Home'],
      coverImageId: '22222222-2222-4222-8222-222222222222',
      coverImageUrl: 'https://signed.example/derivatives/cover/thumb.webp',
      imageWidth: 480,
      imageHeight: 640,
    });
  });

  it('nulls unresolved labels and the cover URL when the image is not ready', async () => {
    vi.mocked(projectsRepository.listPublishedFeed).mockResolvedValue([
      feedRow({ coverStatus: 'processing', localitySlug: null, budgetBandSlug: null }),
    ]);
    vi.mocked(projectsRepository.findTaxonomyLabels).mockResolvedValue(
      new Map([['city:mumbai', 'Mumbai']]),
    );
    vi.mocked(projectsRepository.findLocalityLabels).mockResolvedValue(new Map());

    const result = await projectsService.feed({ page: 1, limit: 12 });

    expect(result.hasMore).toBe(false);
    expect(result.projects[0]).toMatchObject({
      city: 'Mumbai',
      locality: null,
      budget: null,
      coverImageUrl: null,
    });
  });

  it('forwards taxonomy filters to the published feed repository', async () => {
    vi.mocked(projectsRepository.listPublishedFeed).mockResolvedValue([]);
    vi.mocked(projectsRepository.findTaxonomyLabels).mockResolvedValue(new Map());
    vi.mocked(projectsRepository.findLocalityLabels).mockResolvedValue(new Map());

    await projectsService.feed({
      page: 1,
      limit: 12,
      citySlug: ['mumbai', 'pune'],
      roomSlugs: 'living-room',
      themes: 'modern',
    });

    expect(projectsRepository.listPublishedFeed).toHaveBeenCalledWith({
      limit: 13,
      offset: 0,
      filters: {
        citySlug: ['mumbai', 'pune'],
        bhkSlug: undefined,
        propertyTypeSlug: undefined,
        scopeSlug: undefined,
        budgetBandSlug: undefined,
        roomSlugs: 'living-room',
        themes: 'modern',
      },
    });
  });
});
