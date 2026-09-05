import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/modules/project-likes/repository.js', () => ({
  projectLikesRepository: { setLiked: vi.fn(), state: vi.fn() },
}));
const { projectLikesService } = await import('../../../src/modules/project-likes/service.js');
const { projectLikesRepository } = await import('../../../src/modules/project-likes/repository.js');
const projectId = '11111111-1111-4111-8111-111111111111';
beforeEach(() => vi.clearAllMocks());

describe('project likes service', () => {
  it.each([true, false])('returns persisted state when liked=%s', async (liked) => {
    const state = { projectId, liked, likeCount: liked ? 1 : 0 };
    vi.mocked(projectLikesRepository.setLiked).mockResolvedValue(state);
    await expect(projectLikesService.setLiked('visitor', projectId, liked)).resolves.toEqual(state);
  });
  it.each([true, false])('does not expose unavailable projects when liked=%s', async (liked) => {
    vi.mocked(projectLikesRepository.setLiked).mockResolvedValue(null);
    await expect(projectLikesService.setLiked('visitor', projectId, liked)).rejects.toMatchObject({
      status: 404,
    });
  });
  it('normalizes and deduplicates the bounded batch and permits public counts', async () => {
    vi.mocked(projectLikesRepository.state).mockResolvedValue([]);
    await expect(projectLikesService.state(null, { projectIds: projectId })).resolves.toEqual({
      projects: [],
    });
    expect(projectLikesRepository.state).toHaveBeenLastCalledWith(null, [projectId]);
    await projectLikesService.state('visitor', { projectIds: [projectId, projectId] });
    expect(projectLikesRepository.state).toHaveBeenLastCalledWith('visitor', [projectId]);
  });
});
