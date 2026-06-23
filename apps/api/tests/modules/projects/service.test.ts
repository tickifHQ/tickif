import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppError } from '../../../src/lib/errors.js';
import type {
  ProjectImageAttachmentRecord,
  ProjectRecord,
  ProjectRoomRecord,
} from '../../../src/modules/projects/repository.js';

// Replace the Drizzle-backed repository with a fake. This is what makes the
// service unit-testable with NO database — the payoff of the layering rule.
vi.mock('../../../src/modules/projects/repository.js', () => {
  return {
    projectsRepository: {
      list: vi.fn(),
      findById: vi.fn(),
      findByIdWithRooms: vi.fn(),
      findBySlug: vi.fn(),
      createDraft: vi.fn(),
      updateDraft: vi.fn(),
      deleteProject: vi.fn(),
      findDesignerByUserId: vi.fn(),
      findOwnership: vi.fn(),
      taxonomyExists: vi.fn(),
      localityExists: vi.fn(),
      listRooms: vi.fn(),
      findRoom: vi.fn(),
      createRoom: vi.fn(),
      updateRoom: vi.fn(),
      reorderRooms: vi.fn(),
      deleteRoom: vi.fn(),
      findImage: vi.fn(),
      updateImageLink: vi.fn(),
      getReadyImageCounts: vi.fn(),
      submit: vi.fn(),
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

// Import AFTER the mock is registered.
const { projectsService } = await import('../../../src/modules/projects/service.js');
const { projectsRepository } = await import('../../../src/modules/projects/repository.js');

const row = (over: Partial<ProjectRecord> = {}): ProjectRecord => ({
  id: '11111111-1111-4111-8111-111111111111',
  designerId: '22222222-2222-4222-8222-222222222222',
  title: 'Sunlit Bandra Apartment',
  slug: 'sunlit-bandra-apartment',
  description: null,
  status: 'published',
  propertyTypeSlug: null,
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

const imageRow = (over: Partial<ProjectImageAttachmentRecord> = {}): ProjectImageAttachmentRecord => ({
  id: '55555555-5555-4555-8555-555555555555',
  projectId: '11111111-1111-4111-8111-111111111111',
  roomId: null,
  status: 'processing',
  sortOrder: 0,
  ...over,
});

const caller = {
  userId: '99999999-9999-4999-8999-999999999999',
  userRole: 'designer',
  isBanned: false,
};

beforeEach(() => vi.clearAllMocks());

describe('projectsService.list', () => {
  it('maps rows to the response shape and passes pagination through', async () => {
    vi.mocked(projectsRepository.list).mockResolvedValue({ items: [row()], total: 1 });

    const result = await projectsService.list({ limit: 20, offset: 0 });

    expect(result.total).toBe(1);
    expect(result.items[0]).toMatchObject({ slug: 'sunlit-bandra-apartment', status: 'published' });
    // Date is serialized to an ISO string at the boundary.
    expect(result.items[0]!.createdAt).toBe('2026-01-01T00:00:00.000Z');
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
  it('uses the base slug when free', async () => {
    vi.mocked(projectsRepository.findBySlug).mockResolvedValue(null);
    vi.mocked(projectsRepository.findDesignerByUserId).mockResolvedValue({
      id: '22222222-2222-4222-8222-222222222222',
      orgId: 'org_1',
    });
    vi.mocked(projectsRepository.createDraft).mockImplementation(async (_input, _designerId, slug) =>
      row({ slug }),
    );

    const created = await projectsService.create({
      title: 'Sunlit Bandra Apartment',
    }, caller);

    expect(created.slug).toBe('sunlit-bandra-apartment');
  });

  it('appends a suffix when the slug already exists', async () => {
    vi.mocked(projectsRepository.findBySlug).mockResolvedValue(row());
    vi.mocked(projectsRepository.findDesignerByUserId).mockResolvedValue({
      id: '22222222-2222-4222-8222-222222222222',
      orgId: 'org_1',
    });
    vi.mocked(projectsRepository.createDraft).mockImplementation(async (_input, _designerId, slug) =>
      row({ slug }),
    );

    const created = await projectsService.create({
      title: 'Sunlit Bandra Apartment',
    }, caller);

    expect(created.slug).not.toBe('sunlit-bandra-apartment');
    expect(created.slug).toMatch(/^sunlit-bandra-apartment-/);
  });

  it('requires the authenticated user to have a designer profile', async () => {
    vi.mocked(projectsRepository.findDesignerByUserId).mockResolvedValue(null);

    await expect(projectsService.create({ title: 'New Project' }, caller)).rejects.toMatchObject({
      status: 403,
    });
  });
});

describe('projectsService.update', () => {
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
      projectsService.linkImage(
        row().id,
        imageRow().id,
        { roomId: roomRow().id },
        caller,
      ),
    ).rejects.toMatchObject({ status: 404 });
    expect(projectsRepository.findRoom).not.toHaveBeenCalled();
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
    vi.mocked(projectsRepository.getReadyImageCounts).mockResolvedValue({
      readyImageCount: 1,
      taggedReadyImageCount: 0,
    });

    const result = await projectsService.getCompleteness(row().id, caller);

    expect(result.complete).toBe(false);
    expect(result.missing).toContain('property-type');
    expect(result.missing).toContain('at-least-three-photos');
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
    vi.mocked(projectsRepository.getReadyImageCounts).mockResolvedValue({
      readyImageCount: 3,
      taggedReadyImageCount: 3,
    });
    vi.mocked(projectsRepository.submit).mockResolvedValue(
      row({ ...complete, status: 'submitted', submittedAt: new Date('2026-01-02T00:00:00Z') }),
    );
    vi.mocked(projectsRepository.listRooms).mockResolvedValue([roomRow()]);

    const result = await projectsService.submit(complete.id, caller);

    expect(result.status).toBe('submitted');
    expect(result.submittedAt).toBe('2026-01-02T00:00:00.000Z');
    expect(result.rooms).toHaveLength(1);
  });
});
