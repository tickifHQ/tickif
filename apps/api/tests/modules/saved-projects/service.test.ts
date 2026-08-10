import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/modules/saved-projects/repository.js', () => ({
  savedProjectsRepository: {
    savePublished: vi.fn(),
    remove: vi.fn(),
    findSavedProjectIds: vi.fn(),
  },
}));

const { savedProjectsService } = await import('../../../src/modules/saved-projects/service.js');
const { savedProjectsRepository } = await import(
  '../../../src/modules/saved-projects/repository.js'
);

const userId = 'user_1';
const projectId = '11111111-1111-4111-8111-111111111111';
const secondProjectId = '22222222-2222-4222-8222-222222222222';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('savedProjectsService', () => {
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
