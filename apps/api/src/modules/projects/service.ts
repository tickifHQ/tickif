import type {
  CreateProjectInput,
  CreateProjectRoomInput,
  DeleteProjectResponse,
  DeleteProjectRoomResponse,
  LinkProjectImageInput,
  ListProjectRoomsResponse,
  ListProjectsQuery,
  ProjectCompletenessResponse,
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
    propertyTypeSlug: row.propertyTypeSlug,
    propertySubtypeSlug: row.propertySubtypeSlug,
    scopeSlug: row.scopeSlug,
    bhkSlug: row.bhkSlug,
    sizeSqft: row.sizeSqft,
    citySlug: row.citySlug,
    localitySlug: row.localitySlug,
    buildingName: row.buildingName,
    budgetBandSlug: row.budgetBandSlug,
    coverImageId: row.coverImageId,
    completedMonth: row.completedMonth,
    durationMonths: row.durationMonths,
    metadata: row.metadata ?? null,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    submittedAt: row.submittedAt?.toISOString() ?? null,
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
  propertyTypeSlug?: string | null;
  propertySubtypeSlug?: string | null;
  scopeSlug?: string | null;
  bhkSlug?: string | null;
  citySlug?: string | null;
  localitySlug?: string | null;
  budgetBandSlug?: string | null;
}, existing?: Pick<ProjectRecord, 'citySlug' | 'localitySlug' | 'propertyTypeSlug' | 'propertySubtypeSlug'>): Promise<void> {
  if (
    input.propertyTypeSlug !== undefined &&
    input.propertyTypeSlug !== null &&
    !(await projectsRepository.taxonomyExists('property_type', { slug: input.propertyTypeSlug }))
  ) {
    throw AppError.unprocessable('Invalid propertyTypeSlug');
  }

  const propertySubtypeTouched =
    input.propertySubtypeSlug !== undefined || input.propertyTypeSlug !== undefined;
  const nextPropertyTypeSlug =
    input.propertyTypeSlug === undefined ? existing?.propertyTypeSlug ?? null : input.propertyTypeSlug;
  const nextPropertySubtypeSlug =
    input.propertySubtypeSlug === undefined
      ? existing?.propertySubtypeSlug ?? null
      : input.propertySubtypeSlug;
  if (
    propertySubtypeTouched &&
    nextPropertySubtypeSlug !== null &&
    !(await projectsRepository.propertySubtypeExists({
      subtypeSlug: nextPropertySubtypeSlug,
      propertyTypeSlug: nextPropertyTypeSlug,
    }))
  ) {
    throw AppError.unprocessable('Invalid propertySubtypeSlug');
  }

  if (
    input.scopeSlug !== undefined &&
    input.scopeSlug !== null &&
    !(await projectsRepository.taxonomyExists('scope', { slug: input.scopeSlug }))
  ) {
    throw AppError.unprocessable('Invalid scopeSlug');
  }

  if (
    input.bhkSlug !== undefined &&
    input.bhkSlug !== null &&
    !(await projectsRepository.taxonomyExists('bhk', { slug: input.bhkSlug }))
  ) {
    throw AppError.unprocessable('Invalid bhkSlug');
  }

  if (
    input.citySlug !== undefined &&
    input.citySlug !== null &&
    !(await projectsRepository.taxonomyExists('city', { slug: input.citySlug }))
  ) {
    throw AppError.unprocessable('Invalid citySlug');
  }

  const localityTouched = input.localitySlug !== undefined || input.citySlug !== undefined;
  const nextCitySlug = input.citySlug === undefined ? existing?.citySlug ?? null : input.citySlug;
  const nextLocalitySlug =
    input.localitySlug === undefined ? existing?.localitySlug ?? null : input.localitySlug;
  if (localityTouched && nextLocalitySlug !== null) {
    if (!nextCitySlug) {
      throw AppError.unprocessable('citySlug is required with localitySlug');
    }
    if (
      !(await projectsRepository.localityExists({
        citySlug: nextCitySlug,
        localitySlug: nextLocalitySlug,
      }))
    ) {
      throw AppError.unprocessable('Invalid localitySlug');
    }
  }

  if (
    input.budgetBandSlug !== undefined &&
    input.budgetBandSlug !== null &&
    !(await projectsRepository.taxonomyExists('budget_band', { slug: input.budgetBandSlug }))
  ) {
    throw AppError.unprocessable('Invalid budgetBandSlug');
  }
}

function humanizeSlug(slug: string): string {
  return slug
    .split('-')
    .map((part) => (part.toLowerCase() === 'bhk' ? 'BHK' : part.charAt(0).toUpperCase() + part.slice(1)))
    .join(' ');
}

async function labelFor(
  kind: Parameters<typeof projectsRepository.findTaxonomyTermBySlug>[0],
  slug?: string | null,
): Promise<string | null> {
  if (!slug) return null;
  const term = await projectsRepository.findTaxonomyTermBySlug(kind, slug);
  return term?.label ?? humanizeSlug(slug);
}

async function buildProjectTitle(input: CreateProjectInput): Promise<string> {
  const explicit = input.title?.trim();
  if (explicit) return explicit;

  const [city, locality, propertyType, propertySubtype, bhk, budget] = await Promise.all([
    labelFor('city', input.citySlug),
    labelFor('locality', input.localitySlug),
    labelFor('property_type', input.propertyTypeSlug),
    labelFor('property_subtype', input.propertySubtypeSlug),
    labelFor('bhk', input.bhkSlug),
    labelFor('budget_band', input.budgetBandSlug),
  ]);

  const subject = input.buildingName?.trim() || locality || city || 'New Project';
  const descriptor = [bhk, budget, propertySubtype ?? propertyType].filter(
    (part): part is string => !!part,
  );
  const location = city ? ` in ${city}` : '';
  const title = `${subject}${descriptor.length ? ` - ${descriptor.join(' ')}` : ''}${location}`;
  return title.slice(0, 160);
}

function bhkCount(slug?: string | null): number {
  if (!slug) return 1;
  const match = /^([1-4])(?:-plus)?-bhk$/.exec(slug);
  if (!match) return 1;
  const count = Number(match[1]);
  return slug.includes('plus') ? Math.max(count, 4) : count;
}

type RoomPrefillSpec = {
  slug: string;
  name?: string;
  metadata?: CreateProjectRoomInput['metadata'];
};

const ROOM_PREFILLS: Record<string, RoomPrefillSpec[]> = {
  villa: [
    { slug: 'garden-landscape' },
    { slug: 'terrace-rooftop' },
    { slug: 'garage-parking' },
  ],
  farmhouse: [
    { slug: 'garden-landscape' },
    { slug: 'terrace-rooftop' },
    { slug: 'garage-parking' },
  ],
  'commercial-workspace': [
    { slug: 'cabin', metadata: { labels: ['Cabin 1'] } },
    { slug: 'workstation-open-seating' },
    { slug: 'conference-room' },
  ],
  'corporate-office': [],
  'it-tech-office': [],
  'co-working-space': [],
  'home-office': [],
  'creative-studio': [],
  'bank-finance': [],
  'institutional-public': [
    { slug: 'lobby-reception' },
    { slug: 'guest-room', metadata: { labels: ['Guest Room 1'] } },
    { slug: 'restaurant-dining' },
  ],
  'clinic-hospital': [],
  'school-college': [],
  'gym-fitness-center': [],
  'religious-spiritual': [],
  'event-banquet-hall': [],
  'childcare-playschool': [],
  'retail-showroom': [
    { slug: 'storefront-facade' },
    { slug: 'display-area' },
    { slug: 'billing-counter' },
  ],
  showroom: [],
  'retail-store': [],
  'jewellery-store': [],
  'salon-spa': [],
  'pharmacy-clinic-store': [],
  'pop-up-kiosk': [],
  'food-hospitality': [
    { slug: 'dining-area' },
    { slug: 'kitchen' },
    { slug: 'bar-counter' },
  ],
  'cafe-coffee-shop': [],
  restaurant: [],
  'bar-lounge': [],
  'hotel-resort': [],
  'homestay-airbnb': [],
  'bakery-patisserie': [],
};

for (const alias of [
  'corporate-office',
  'it-tech-office',
  'co-working-space',
  'home-office',
  'creative-studio',
  'bank-finance',
]) {
  ROOM_PREFILLS[alias] = ROOM_PREFILLS['commercial-workspace']!;
}
for (const alias of [
  'clinic-hospital',
  'school-college',
  'gym-fitness-center',
  'religious-spiritual',
  'event-banquet-hall',
  'childcare-playschool',
]) {
  ROOM_PREFILLS[alias] = ROOM_PREFILLS['institutional-public']!;
}
for (const alias of [
  'showroom',
  'retail-store',
  'jewellery-store',
  'salon-spa',
  'pharmacy-clinic-store',
  'pop-up-kiosk',
]) {
  ROOM_PREFILLS[alias] = ROOM_PREFILLS['retail-showroom']!;
}
for (const alias of [
  'cafe-coffee-shop',
  'restaurant',
  'bar-lounge',
  'hotel-resort',
  'homestay-airbnb',
  'bakery-patisserie',
]) {
  ROOM_PREFILLS[alias] = ROOM_PREFILLS['food-hospitality']!;
}

function buildRoomPrefillSpecs(project: Pick<ProjectRecord, 'propertyTypeSlug' | 'propertySubtypeSlug' | 'bhkSlug'>): RoomPrefillSpec[] {
  const key = project.propertySubtypeSlug ?? project.propertyTypeSlug;
  if (key === 'apartment' || key === 'residential' || key === 'penthouse' || key === 'studio-apartment' || key === 'duplex-triplex' || key === 'row-house-town-house') {
    const bedrooms = Array.from({ length: bhkCount(project.bhkSlug) }, (_, index): RoomPrefillSpec => ({
      slug: 'bedroom',
      name: index === 0 ? 'Master Bedroom' : `Bedroom ${index + 1}`,
      metadata: { labels: [index === 0 ? 'Master' : `Bedroom ${index + 1}`] },
    }));
    return [{ slug: 'kitchen' }, ...bedrooms, { slug: 'bathroom' }];
  }
  return key ? ROOM_PREFILLS[key] ?? [] : [];
}

async function prefillRoomsIfEmpty(
  project: Pick<ProjectRecord, 'id' | 'propertyTypeSlug' | 'propertySubtypeSlug' | 'bhkSlug'>,
  existingRooms?: ProjectRoomRecord[],
): Promise<ProjectRoomRecord[]> {
  const rooms = existingRooms ?? (await projectsRepository.listRooms(project.id));
  if (rooms.length > 0) return rooms;

  const specs = buildRoomPrefillSpecs(project);
  if (specs.length === 0) return rooms;
  const roomTypeSlugs = [...new Set(specs.map((spec) => spec.slug))];
  const roomTypes = await projectsRepository.findRoomTypesBySlugs(roomTypeSlugs);
  const roomTypeBySlug = new Map(roomTypes.map((term) => [term.slug, term]));
  const inputs = specs.flatMap((spec, index): CreateProjectRoomInput[] => {
    const term = roomTypeBySlug.get(spec.slug);
    if (!term) return [];
    return [{
      roomTypeId: term.id,
      name: spec.name ?? term.label,
      sortOrder: index,
      metadata: spec.metadata,
    }];
  });
  return projectsRepository.createRooms(project.id, inputs);
}

async function validateRoomType(roomTypeId: string): Promise<void> {
  if (!(await projectsRepository.taxonomyExists('room', { id: roomTypeId }))) {
    throw AppError.unprocessable('Invalid roomTypeId');
  }
}

function buildCompleteness(
  project: ProjectRecord,
  imageCounts: { readyImageCount: number; taggedReadyImageCount: number },
): ProjectCompletenessResponse {
  const requirements = [
    { key: 'project-name', label: 'Project name', complete: project.title.trim().length > 0 },
    { key: 'location-city', label: 'Location city', complete: !!project.citySlug },
    { key: 'property-type', label: 'Property type', complete: !!project.propertyTypeSlug },
    { key: 'scope', label: 'Scope', complete: !!project.scopeSlug },
    { key: 'cost-range', label: 'Cost range', complete: !!project.budgetBandSlug },
    {
      key: 'at-least-three-photos',
      label: 'At least 3 ready photos',
      complete: imageCounts.readyImageCount >= 3,
    },
    {
      key: 'image-metadata',
      label: 'Room, theme, and finish metadata on each ready photo',
      complete:
        imageCounts.readyImageCount >= 3 &&
        imageCounts.taggedReadyImageCount === imageCounts.readyImageCount,
    },
  ];
  const completeCount = requirements.filter((requirement) => requirement.complete).length;
  return {
    complete: completeCount === requirements.length,
    score: Math.round((completeCount / requirements.length) * 100),
    missing: requirements
      .filter((requirement) => !requirement.complete)
      .map((requirement) => requirement.key),
    requirements,
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

    const title = await buildProjectTitle(input);
    const draftInput = { ...input, title };

    // Ensure a unique slug; append a short suffix on collision.
    const base = projectsRepository.slugify(title);
    let slug = base;
    if (await projectsRepository.findBySlug(slug)) {
      slug = `${base}-${Date.now().toString(36).slice(-4)}`;
    }
    const row = await projectsRepository.createDraft(draftInput, designer.id, slug);
    const rooms = await prefillRoomsIfEmpty(row, []);
    return toDetailResponse(row, rooms);
  },

  async update(
    projectId: string,
    input: UpdateProjectInput,
    caller: Caller,
  ): Promise<ProjectDetailResponse> {
    await requireMutableDraft(projectId, caller);
    const existing = await projectsRepository.findById(projectId);
    if (!existing) throw AppError.notFound('Project not found');
    await validateProjectTaxonomy(input, existing);

    if (input.coverImageId) {
      const image = await projectsRepository.findImage(projectId, input.coverImageId);
      if (!image) throw AppError.unprocessable('Cover image must belong to the project');
    }

    const row = await projectsRepository.updateDraft(projectId, input);
    if (!row) throw AppError.notFound('Project not found');
    const rooms = await prefillRoomsIfEmpty(row);
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

  async getCompleteness(projectId: string, caller: Caller): Promise<ProjectCompletenessResponse> {
    await requireMutableDraft(projectId, caller);
    const project = await projectsRepository.findById(projectId);
    if (!project) throw AppError.notFound('Project not found');
    return buildCompleteness(project, await projectsRepository.getReadyImageCounts(projectId));
  },

  async submit(projectId: string, caller: Caller): Promise<ProjectDetailResponse> {
    await requireMutableDraft(projectId, caller);
    const project = await projectsRepository.findById(projectId);
    if (!project) throw AppError.notFound('Project not found');

    const completeness = buildCompleteness(
      project,
      await projectsRepository.getReadyImageCounts(projectId),
    );
    if (!completeness.complete) {
      throw AppError.unprocessable('Project is missing required upload information', {
        missing: completeness.missing,
      });
    }

    return toDetailResponse(await projectsRepository.submit(projectId), await projectsRepository.listRooms(projectId));
  },
};
