import type {
  CreateProjectInput,
  ListProjectsQuery,
  ProjectResponse,
  ListProjectsResponse,
} from '@repo/contracts';
import { AppError } from '../../lib/errors.js';
import { projectsRepository, type ProjectRecord } from './repository.js';

/**
 * Project use-cases. Business logic lives here and imports NEITHER Hono NOR
 * Drizzle — only the repository and shared contracts. This keeps the layer
 * unit-testable with a fake repository and free to move to its own service.
 */

function toResponse(row: ProjectRecord): ProjectResponse {
  return {
    id: row.id,
    designerId: row.designerId,
    title: row.title,
    slug: row.slug,
    description: row.description,
    status: row.status,
    citySlug: row.citySlug,
    budgetBandSlug: row.budgetBandSlug,
    metadata: row.metadata ?? null,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export const projectsService = {
  async list(query: ListProjectsQuery): Promise<ListProjectsResponse> {
    const { items, total } = await projectsRepository.list({
      status: query.status,
      citySlug: query.citySlug,
      limit: query.limit,
      offset: query.offset,
    });
    return {
      items: items.map(toResponse),
      total,
      limit: query.limit,
      offset: query.offset,
    };
  },

  async getById(id: string): Promise<ProjectResponse> {
    const row = await projectsRepository.findById(id);
    if (!row) throw AppError.notFound(`Project ${id} not found`);
    return toResponse(row);
  },

  async create(input: CreateProjectInput): Promise<ProjectResponse> {
    // Ensure a unique slug; append a short suffix on collision.
    const base = projectsRepository.slugify(input.title);
    let slug = base;
    if (await projectsRepository.findBySlug(slug)) {
      slug = `${base}-${Date.now().toString(36).slice(-4)}`;
    }
    const row = await projectsRepository.create(input, slug);
    return toResponse(row);
  },
};
