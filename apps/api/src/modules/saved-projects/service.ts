import type {
  SavedProjectState,
  SavedProjectsStateQuery,
  SavedProjectsStateResponse,
} from '@repo/contracts';
import { AppError } from '../../lib/errors.js';
import { savedProjectsRepository } from './repository.js';

export const savedProjectsService = {
  async save(userId: string, projectId: string): Promise<SavedProjectState> {
    const saved = await savedProjectsRepository.savePublished(userId, projectId);
    if (!saved) throw AppError.notFound('Project not found');
    return { projectId, saved: true };
  },

  async remove(userId: string, projectId: string): Promise<SavedProjectState> {
    await savedProjectsRepository.remove(userId, projectId);
    return { projectId, saved: false };
  },

  async state(
    userId: string,
    query: SavedProjectsStateQuery,
  ): Promise<SavedProjectsStateResponse> {
    const projectIds = Array.isArray(query.projectIds) ? query.projectIds : [query.projectIds];
    const savedProjectIds = await savedProjectsRepository.findSavedProjectIds(userId, projectIds);
    return { savedProjectIds };
  },
};
