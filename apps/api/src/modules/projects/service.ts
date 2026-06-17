import type {
  CreateProjectInput,
  CreateProjectRoomInput,
  DeleteProjectResponse,
  DeleteProjectRoomResponse,
  LinkProjectImageInput,
  ListProjectRoomsResponse,
  ListProjectsQuery,
  ProjectDetailResponse,
  ProjectImageAttachment,
  ProjectResponse,
  ListProjectsResponse,
  ProjectRoom,
  ReorderProjectRoomsInput,
  UpdateProjectInput,
  UpdateProjectRoomInput,
} from '@repo/contracts';
import { AppError } from '../../lib/errors.js';
import {
  projectsRepository,
  type ProjectImageAttachmentRecord,
  type ProjectOwnership,
  type ProjectRecord,
  type ProjectRoomRecord,
} from './repository.js';

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
    coverImageId: row.coverImageId,
    metadata: row.metadata ?? null,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toRoomResponse(row: ProjectRoomRecord): ProjectRoom {
  return {
    id: row.id,
    projectId: row.projectId,
    roomTypeId: row.roomTypeId,
    name: row.name,
    description: row.description,
    sortOrder: row.sortOrder,
    metadata: row.metadata ?? {},
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toDetailResponse(row: ProjectRecord, rooms: ProjectRoomRecord[]): ProjectDetailResponse {
  return {
    ...toResponse(row),
    rooms: rooms.map(toRoomResponse),
  };
}

function toImageAttachment(row: ProjectImageAttachmentRecord): ProjectImageAttachment {
  return {
    id: row.id,
    projectId: row.projectId,
    roomId: row.roomId,
    status: row.status,
    sortOrder: row.sortOrder,
  };
}

/** The authenticated caller, as resolved by the route from the session. */
export type Caller = { userId: string; userRole: string; isBanned: boolean };

function assertAccess(ownership: ProjectOwnership, caller: Caller): void {
  if (caller.isBanned) throw AppError.forbidden('Account suspended');
  if (caller.userRole === 'superadmin') return;
  if (ownership.ownerUserId && ownership.ownerUserId === caller.userId) return;
  throw AppError.forbidden();
}

async function requireMutableDraft(projectId: string, caller: Caller): Promise<ProjectOwnership> {
  const ownership = await projectsRepository.findOwnership(projectId);
  if (!ownership) throw AppError.notFound('Project not found');
  await assertAccess(ownership, caller);
  if (ownership.status !== 'draft') {
    throw AppError.conflict('Only draft projects can be edited');
  }
  return ownership;
}

async function validateProjectTaxonomy(input: {
  citySlug?: string | null;
  budgetBandSlug?: string | null;
}): Promise<void> {
  if (
    input.citySlug !== undefined &&
    input.citySlug !== null &&
    !(await projectsRepository.taxonomyExists('city', { slug: input.citySlug }))
  ) {
    throw AppError.unprocessable('Invalid citySlug');
  }

  if (
    input.budgetBandSlug !== undefined &&
    input.budgetBandSlug !== null &&
    !(await projectsRepository.taxonomyExists('budget_band', { slug: input.budgetBandSlug }))
  ) {
    throw AppError.unprocessable('Invalid budgetBandSlug');
  }
}

async function validateRoomType(roomTypeId: string): Promise<void> {
  if (!(await projectsRepository.taxonomyExists('room', { id: roomTypeId }))) {
    throw AppError.unprocessable('Invalid roomTypeId');
  }
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

  async getById(id: string, caller?: Caller): Promise<ProjectDetailResponse> {
    const row = await projectsRepository.findByIdWithRooms(id);
    if (!row) throw AppError.notFound(`Project ${id} not found`);

    if (row.project.status !== 'published') {
      if (!caller) throw AppError.notFound(`Project ${id} not found`);
      const ownership = await projectsRepository.findOwnership(id);
      if (!ownership) throw AppError.notFound(`Project ${id} not found`);
      await assertAccess(ownership, caller);
    }

    return toDetailResponse(row.project, row.rooms);
  },

  async create(input: CreateProjectInput, caller: Caller): Promise<ProjectDetailResponse> {
    await validateProjectTaxonomy(input);

    const designer = await projectsRepository.findDesignerByUserId(caller.userId);
    if (!designer) {
      throw AppError.forbidden('Designer profile required');
    }

    // Ensure a unique slug; append a short suffix on collision.
    const base = projectsRepository.slugify(input.title);
    let slug = base;
    if (await projectsRepository.findBySlug(slug)) {
      slug = `${base}-${Date.now().toString(36).slice(-4)}`;
    }
    const row = await projectsRepository.createDraft(input, designer.id, slug);
    return toDetailResponse(row, []);
  },

  async update(
    projectId: string,
    input: UpdateProjectInput,
    caller: Caller,
  ): Promise<ProjectDetailResponse> {
    await requireMutableDraft(projectId, caller);
    await validateProjectTaxonomy(input);

    if (input.coverImageId) {
      const image = await projectsRepository.findImage(projectId, input.coverImageId);
      if (!image) throw AppError.unprocessable('Cover image must belong to the project');
    }

    const row = await projectsRepository.updateDraft(projectId, input);
    if (!row) throw AppError.notFound('Project not found');
    const rooms = await projectsRepository.listRooms(projectId);
    return toDetailResponse(row, rooms);
  },

  async delete(projectId: string, caller: Caller): Promise<DeleteProjectResponse> {
    await requireMutableDraft(projectId, caller);
    if (!(await projectsRepository.deleteProject(projectId))) {
      throw AppError.notFound('Project not found');
    }
    return { id: projectId, deleted: true };
  },

  async listRooms(projectId: string, caller: Caller): Promise<ListProjectRoomsResponse> {
    await requireMutableDraft(projectId, caller);
    const rooms = await projectsRepository.listRooms(projectId);
    return { items: rooms.map(toRoomResponse) };
  },

  async createRoom(
    projectId: string,
    input: CreateProjectRoomInput,
    caller: Caller,
  ): Promise<ProjectRoom> {
    await requireMutableDraft(projectId, caller);
    await validateRoomType(input.roomTypeId);
    const row = await projectsRepository.createRoom(projectId, input);
    return toRoomResponse(row);
  },

  async updateRoom(
    projectId: string,
    roomId: string,
    input: UpdateProjectRoomInput,
    caller: Caller,
  ): Promise<ProjectRoom> {
    await requireMutableDraft(projectId, caller);
    if (input.roomTypeId) await validateRoomType(input.roomTypeId);
    const row = await projectsRepository.updateRoom(projectId, roomId, input);
    if (!row) throw AppError.notFound('Room not found');
    return toRoomResponse(row);
  },

  async reorderRooms(
    projectId: string,
    input: ReorderProjectRoomsInput,
    caller: Caller,
  ): Promise<ListProjectRoomsResponse> {
    await requireMutableDraft(projectId, caller);
    const rooms = await projectsRepository.reorderRooms(projectId, input);
    if (!rooms) throw AppError.unprocessable('All reordered rooms must belong to the project');
    return { items: rooms.map(toRoomResponse) };
  },

  async deleteRoom(
    projectId: string,
    roomId: string,
    caller: Caller,
  ): Promise<DeleteProjectRoomResponse> {
    await requireMutableDraft(projectId, caller);
    if (!(await projectsRepository.deleteRoom(projectId, roomId))) {
      throw AppError.notFound('Room not found');
    }
    return { id: roomId, deleted: true };
  },

  async linkImage(
    projectId: string,
    imageId: string,
    input: LinkProjectImageInput,
    caller: Caller,
  ): Promise<ProjectImageAttachment> {
    await requireMutableDraft(projectId, caller);

    const image = await projectsRepository.findImage(projectId, imageId);
    if (!image) throw AppError.notFound('Image not found');

    if (input.roomId) {
      const room = await projectsRepository.findRoom(projectId, input.roomId);
      if (!room) throw AppError.unprocessable('Room must belong to the project');
    }

    const row = await projectsRepository.updateImageLink(projectId, imageId, input);
    if (!row) throw AppError.notFound('Image not found');
    return toImageAttachment(row);
  },
};
