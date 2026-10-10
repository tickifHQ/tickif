import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/modules/saved-projects/repository.js', () => ({
  savedProjectsRepository: {
    savePublished: vi.fn(),
    remove: vi.fn(),
    findSavedProjectIds: vi.fn(),
    countVisible: vi.fn(),
  },
}));

vi.mock('../../../src/modules/projects/service.js', () => ({
  projectsService: { feed: vi.fn() },
}));
const { projectsService } = await import('../../../src/modules/projects/service.js');

const { savedProjectsService } = await import('../../../src/modules/saved-projects/service.js');
const { savedProjectsRepository } =
  await import('../../../src/modules/saved-projects/repository.js');

const userId = 'user_1';
const projectId = '11111111-1111-4111-8111-111111111111';
const secondProjectId = '22222222-2222-4222-8222-222222222222';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('savedProjectsService', () => {
  it('scopes the public projection and visible count to the caller', async () => {
    vi.mocked(projectsService.feed).mockResolvedValue({
      projects: [],
      page: 2,
      limit: 12,
      hasMore: false,
    });
    vi.mocked(savedProjectsRepository.countVisible).mockResolvedValue(13);
    await expect(savedProjectsService.list(userId, { page: 2, limit: 12 })).resolves.toEqual({
      projects: [],
      page: 2,
      limit: 12,
      total: 13,
      totalPages: 2,
    });
    expect(projectsService.feed).toHaveBeenCalledWith({ page: 2, limit: 12 }, userId);
    expect(savedProjectsRepository.countVisible).toHaveBeenCalledWith(userId);
  });

  it('returns an honest empty list and propagates read failures', async () => {
    vi.mocked(projectsService.feed).mockResolvedValue({
      projects: [],
      page: 1,
      limit: 12,
      hasMore: false,
    });
    vi.mocked(savedProjectsRepository.countVisible).mockResolvedValue(0);
    expect((await savedProjectsService.list(userId, { page: 1, limit: 12 })).totalPages).toBe(0);
    vi.mocked(savedProjectsRepository.countVisible).mockRejectedValue(new Error('DB offline'));
    await expect(savedProjectsService.list(userId, { page: 1, limit: 12 })).rejects.toThrow(
      'DB offline',
    );
  });
  it('returns saved state after persisting a published project', async () => {
    vi.mocked(savedProjectsRepository.savePublished).mockResolvedValue(true);

    await expect(savedProjectsService.save(userId, projectId)).resolves.toEqual({
      projectId,
      saved: true,
    });
  });

  it('does not reveal unavailable projects', async () => {
    vi.mocked(savedProjectsRepository.savePublished).mockResolvedValue(false);

    await expect(savedProjectsService.save(userId, projectId)).rejects.toMatchObject({
      code: 'not_found',
      status: 404,
    });
  });

  it('removes saved state idempotently', async () => {
    vi.mocked(savedProjectsRepository.remove).mockResolvedValue();

    await expect(savedProjectsService.remove(userId, projectId)).resolves.toEqual({
      projectId,
      saved: false,
    });
  });

  it('normalizes one id and batches multiple ids into one repository call', async () => {
    vi.mocked(savedProjectsRepository.findSavedProjectIds).mockResolvedValue([projectId]);

    await expect(savedProjectsService.state(userId, { projectIds: projectId })).resolves.toEqual({
      savedProjectIds: [projectId],
    });
    expect(savedProjectsRepository.findSavedProjectIds).toHaveBeenLastCalledWith(userId, [
      projectId,
    ]);

    await savedProjectsService.state(userId, { projectIds: [projectId, secondProjectId] });
    expect(savedProjectsRepository.findSavedProjectIds).toHaveBeenLastCalledWith(userId, [
      projectId,
      secondProjectId,
    ]);
  });
});
