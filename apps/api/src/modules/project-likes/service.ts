import type { ProjectLikeState, ProjectLikesStateQuery, ProjectLikesStateResponse } from '@repo/contracts';
import { AppError } from '../../lib/errors.js';
import { projectLikesRepository } from './repository.js';

export const projectLikesService = {
  async setLiked(userId: string, projectId: string, liked: boolean): Promise<ProjectLikeState> {
    const state = await projectLikesRepository.setLiked(userId, projectId, liked);
    if (!state) throw AppError.notFound('Project not found');
    return state;
  },

  async state(userId: string | null, query: ProjectLikesStateQuery): Promise<ProjectLikesStateResponse> {
    const ids = Array.isArray(query.projectIds) ? query.projectIds : [query.projectIds];
    return { projects: await projectLikesRepository.state(userId, [...new Set(ids)]) };
  },
};
