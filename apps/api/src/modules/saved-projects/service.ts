import type {
  SavedProjectState,
  SavedProjectsStateQuery,
  SavedProjectsStateResponse,
  ListSavedProjectsQuery,
  ListSavedProjectsResponse,
} from '@repo/contracts';
import { AppError } from '../../lib/errors.js';
import { savedProjectsRepository } from './repository.js';
import { projectsService } from '../projects/service.js';

export const savedProjectsService = {
  async list(userId: string, query: ListSavedProjectsQuery): Promise<ListSavedProjectsResponse> {
    const [feed, total] = await Promise.all([
      projectsService.feed(query, userId),
      savedProjectsRepository.countVisible(userId),
    ]);
    return { ...query, projects: feed.projects, total, totalPages: Math.ceil(total / query.limit) };
  },
  async save(userId: string, projectId: string): Promise<SavedProjectState> {
    const saved = await savedProjectsRepository.savePublished(userId, projectId);
    if (!saved) throw AppError.notFound('Project not found');
    return { projectId, saved: true };
  },

  async remove(userId: string, projectId: string): Promise<SavedProjectState> {
    await savedProjectsRepository.remove(userId, projectId);
    return { projectId, saved: false };
  },

  async state(userId: string, query: SavedProjectsStateQuery): Promise<SavedProjectsStateResponse> {
    const projectIds = Array.isArray(query.projectIds) ? query.projectIds : [query.projectIds];
    const savedProjectIds = await savedProjectsRepository.findSavedProjectIds(userId, projectIds);
    return { savedProjectIds };
  },
};
