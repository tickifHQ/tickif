import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppError } from '../../../src/lib/errors.js';

// Replace the Drizzle-backed repository with a fake. This is what makes the
// service unit-testable with NO database — the payoff of the layering rule.
vi.mock('../../../src/modules/projects/repository.js', () => {
  return {
    projectsRepository: {
      list: vi.fn(),
      findById: vi.fn(),
      findBySlug: vi.fn(),
      create: vi.fn(),
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

const row = (over: Partial<Record<string, unknown>> = {}) => ({
  id: '11111111-1111-1111-1111-111111111111',
  designerId: '22222222-2222-2222-2222-222222222222',
  title: 'Sunlit Bandra Apartment',
  slug: 'sunlit-bandra-apartment',
  description: null,
  status: 'published',
  citySlug: 'mumbai',
  budgetBandSlug: null,
  metadata: {},
  publishedAt: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  ...over,
});

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
    vi.mocked(projectsRepository.findById).mockResolvedValue(null);

    await expect(projectsService.getById('missing')).rejects.toBeInstanceOf(AppError);
    await expect(projectsService.getById('missing')).rejects.toMatchObject({ status: 404 });
  });
});

describe('projectsService.create', () => {
  it('uses the base slug when free', async () => {
    vi.mocked(projectsRepository.findBySlug).mockResolvedValue(null);
    vi.mocked(projectsRepository.create).mockImplementation(async (_input, slug) => row({ slug }));

    const created = await projectsService.create({
      designerId: '22222222-2222-2222-2222-222222222222',
      title: 'Sunlit Bandra Apartment',
    });

    expect(created.slug).toBe('sunlit-bandra-apartment');
  });

  it('appends a suffix when the slug already exists', async () => {
    vi.mocked(projectsRepository.findBySlug).mockResolvedValue(row());
    vi.mocked(projectsRepository.create).mockImplementation(async (_input, slug) => row({ slug }));

    const created = await projectsService.create({
      designerId: '22222222-2222-2222-2222-222222222222',
      title: 'Sunlit Bandra Apartment',
    });

    expect(created.slug).not.toBe('sunlit-bandra-apartment');
    expect(created.slug).toMatch(/^sunlit-bandra-apartment-/);
  });
});
