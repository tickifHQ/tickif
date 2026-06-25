import { inArray } from 'drizzle-orm';
import { db, schema, eq, and, desc, asc, sql } from '@repo/db';
import type {
  CreateProjectInput,
  CreateProjectRoomInput,
  LinkProjectImageInput,
  ProjectStatus,
  ReorderProjectRoomsInput,
  UpdateProjectInput,
  UpdateProjectRoomInput,
} from '@repo/contracts';

/**
 * Data-access for projects. This is the ONLY layer that imports Drizzle.
 * It exposes a framework-free record type and typed methods over the schema.
 */
export type ProjectRecord = typeof schema.project.$inferSelect;
export type ProjectRoomRecord = typeof schema.projectRoom.$inferSelect;
type ProjectImageRecord = typeof schema.projectImage.$inferSelect;
export type TaxonomyTermRecord = Pick<
  typeof schema.taxonomy.$inferSelect,
  'id' | 'kind' | 'slug' | 'label' | 'metadata'
>;
export type ProjectImageAttachmentRecord = Pick<
  ProjectImageRecord,
  'id' | 'projectId' | 'roomId' | 'status' | 'sortOrder'
>;

export type ProjectOwnership = {
  projectId: string;
  designerId: string;
  status: ProjectStatus;
  ownerUserId: string | null;
};

export type ListProjectsParams = {
  status?: ProjectStatus;
  citySlug?: string;
  limit: number;
  offset: number;
};

function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'project'
  );
}

export const projectsRepository = {
  async list(params: ListProjectsParams): Promise<{ items: ProjectRecord[]; total: number }> {
    const filters = [
      params.status ? eq(schema.project.status, params.status) : undefined,
      params.citySlug ? eq(schema.project.citySlug, params.citySlug) : undefined,
    ].filter((f) => f !== undefined);

    const where = filters.length ? and(...filters) : undefined;

    const [items, [count]] = await Promise.all([
      db
        .select()
        .from(schema.project)
        .where(where)
        .orderBy(desc(schema.project.createdAt))
        .limit(params.limit)
        .offset(params.offset),
      db.select({ value: sql<number>`count(*)::int` }).from(schema.project).where(where),
    ]);

    return { items, total: count?.value ?? 0 };
  },

  async findById(id: string): Promise<ProjectRecord | null> {
    const [row] = await db.select().from(schema.project).where(eq(schema.project.id, id)).limit(1);
    return row ?? null;
  },

  async findByIdWithRooms(
    id: string,
  ): Promise<{ project: ProjectRecord; rooms: ProjectRoomRecord[] } | null> {
    const project = await this.findById(id);
    if (!project) return null;
    const rooms = await this.listRooms(id);
    return { project, rooms };
  },

  async findBySlug(slug: string): Promise<ProjectRecord | null> {
    const [row] = await db
      .select()
      .from(schema.project)
      .where(eq(schema.project.slug, slug))
      .limit(1);
    return row ?? null;
  },

  async createDraft(
    input: CreateProjectInput & { title: string },
    designerId: string,
    slug: string,
  ): Promise<ProjectRecord> {
    const [row] = await db
      .insert(schema.project)
      .values({
        designerId,
        title: input.title,
        slug,
        description: input.description ?? null,
        propertyTypeSlug: input.propertyTypeSlug ?? null,
        propertySubtypeSlug: input.propertySubtypeSlug ?? null,
        scopeSlug: input.scopeSlug ?? null,
        bhkSlug: input.bhkSlug ?? null,
        sizeSqft: input.sizeSqft ?? null,
        citySlug: input.citySlug ?? null,
        localitySlug: input.localitySlug ?? null,
        buildingName: input.buildingName ?? null,
        budgetBandSlug: input.budgetBandSlug ?? null,
        completedMonth: input.completedMonth ?? null,
        durationMonths: input.durationMonths ?? null,
        metadata: input.metadata ?? {},
      })
      .returning();
    if (!row) throw new Error('insert returned no row');
    return row;
  },

  async updateDraft(id: string, input: UpdateProjectInput): Promise<ProjectRecord | null> {
    const patch: Partial<typeof schema.project.$inferInsert> = {};
    if (input.title !== undefined) patch.title = input.title;
    if (input.description !== undefined) patch.description = input.description;
    if (input.propertyTypeSlug !== undefined) patch.propertyTypeSlug = input.propertyTypeSlug;
    if (input.propertySubtypeSlug !== undefined) patch.propertySubtypeSlug = input.propertySubtypeSlug;
    if (input.scopeSlug !== undefined) patch.scopeSlug = input.scopeSlug;
    if (input.bhkSlug !== undefined) patch.bhkSlug = input.bhkSlug;
    if (input.sizeSqft !== undefined) patch.sizeSqft = input.sizeSqft;
    if (input.citySlug !== undefined) patch.citySlug = input.citySlug;
    if (input.localitySlug !== undefined) patch.localitySlug = input.localitySlug;
    if (input.buildingName !== undefined) patch.buildingName = input.buildingName;
    if (input.budgetBandSlug !== undefined) patch.budgetBandSlug = input.budgetBandSlug;
    if (input.completedMonth !== undefined) patch.completedMonth = input.completedMonth;
    if (input.durationMonths !== undefined) patch.durationMonths = input.durationMonths;
    if (input.coverImageId !== undefined) patch.coverImageId = input.coverImageId;
    if (input.metadata !== undefined) patch.metadata = input.metadata;

    const [row] = await db
      .update(schema.project)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(schema.project.id, id))
      .returning();
    return row ?? null;
  },

  async submit(id: string): Promise<ProjectRecord> {
    const now = new Date();
    const [row] = await db
      .update(schema.project)
      .set({ status: 'submitted', submittedAt: now, updatedAt: now })
      .where(eq(schema.project.id, id))
      .returning();
    if (!row) throw new Error('update returned no row');
    return row;
  },

  async getReadyImageCounts(projectId: string): Promise<{
    readyImageCount: number;
    taggedReadyImageCount: number;
  }> {
    const [row] = await db
      .select({
        readyImageCount: sql<number>`count(*)::int`,
        taggedReadyImageCount: sql<number>`
          count(*) filter (
            where ${schema.projectImage.roomId} is not null
              and jsonb_array_length(${schema.projectImage.themeSlugs}) > 0
              and jsonb_array_length(${schema.projectImage.finishSlugs}) > 0
          )::int
        `,
      })
      .from(schema.projectImage)
      .where(
        and(
          eq(schema.projectImage.projectId, projectId),
          eq(schema.projectImage.status, 'ready'),
        ),
      );
    return {
      readyImageCount: row?.readyImageCount ?? 0,
      taggedReadyImageCount: row?.taggedReadyImageCount ?? 0,
    };
  },

  async deleteProject(id: string): Promise<boolean> {
    const rows = await db.delete(schema.project).where(eq(schema.project.id, id)).returning({
      id: schema.project.id,
    });
    return rows.length > 0;
  },

  async findDesignerByUserId(userId: string): Promise<{ id: string; orgId: string } | null> {
    const [row] = await db
      .select({ id: schema.designerProfile.id, orgId: schema.designerProfile.orgId })
      .from(schema.designerProfile)
      .where(eq(schema.designerProfile.userId, userId))
      .limit(1);
    return row ?? null;
  },

  async findOwnership(projectId: string): Promise<ProjectOwnership | null> {
    const [row] = await db
      .select({
        projectId: schema.project.id,
        designerId: schema.project.designerId,
        status: schema.project.status,
        ownerUserId: schema.designerProfile.userId,
      })
      .from(schema.project)
      .innerJoin(schema.designerProfile, eq(schema.project.designerId, schema.designerProfile.id))
      .where(eq(schema.project.id, projectId))
      .limit(1);
    return row ?? null;
  },

  async taxonomyExists(
    kind: (typeof schema.taxonomyKindEnum.enumValues)[number],
    value: { id: string } | { slug: string },
  ): Promise<boolean> {
    const where =
      'id' in value
        ? and(eq(schema.taxonomy.kind, kind), eq(schema.taxonomy.id, value.id))
        : and(eq(schema.taxonomy.kind, kind), eq(schema.taxonomy.slug, value.slug));
    const [row] = await db.select({ id: schema.taxonomy.id }).from(schema.taxonomy).where(where).limit(1);
    return !!row;
  },

  async findTaxonomyTermBySlug(
    kind: (typeof schema.taxonomyKindEnum.enumValues)[number],
    slug: string,
  ): Promise<TaxonomyTermRecord | null> {
    const [row] = await db
      .select({
        id: schema.taxonomy.id,
        kind: schema.taxonomy.kind,
        slug: schema.taxonomy.slug,
        label: schema.taxonomy.label,
        metadata: schema.taxonomy.metadata,
      })
      .from(schema.taxonomy)
      .where(and(eq(schema.taxonomy.kind, kind), eq(schema.taxonomy.slug, slug)))
      .limit(1);
    return row ?? null;
  },

  async propertySubtypeExists(input: {
    subtypeSlug: string;
    propertyTypeSlug?: string | null;
  }): Promise<boolean> {
    const filters = [
      eq(schema.taxonomy.kind, 'property_subtype'),
      eq(schema.taxonomy.slug, input.subtypeSlug),
      input.propertyTypeSlug
        ? sql`${schema.taxonomy.metadata}->>'propertyTypeSlug' = ${input.propertyTypeSlug}`
        : undefined,
    ].filter((f) => f !== undefined);

    const [row] = await db
      .select({ id: schema.taxonomy.id })
      .from(schema.taxonomy)
      .where(and(...filters))
      .limit(1);
    return !!row;
  },

  async localityExists(input: { citySlug: string; localitySlug: string }): Promise<boolean> {
    const [city] = await db
      .select({ id: schema.taxonomy.id })
      .from(schema.taxonomy)
      .where(and(eq(schema.taxonomy.kind, 'city'), eq(schema.taxonomy.slug, input.citySlug)))
      .limit(1);
    if (!city) return false;

    const [locality] = await db
      .select({ id: schema.taxonomy.id })
      .from(schema.taxonomy)
      .where(
        and(
          eq(schema.taxonomy.kind, 'locality'),
          eq(schema.taxonomy.slug, input.localitySlug),
          eq(schema.taxonomy.parentId, city.id),
        ),
      )
      .limit(1);
    return !!locality;
  },

  async listRooms(projectId: string): Promise<ProjectRoomRecord[]> {
    return db
      .select()
      .from(schema.projectRoom)
      .where(eq(schema.projectRoom.projectId, projectId))
      .orderBy(asc(schema.projectRoom.sortOrder), asc(schema.projectRoom.createdAt));
  },

  async findRoom(projectId: string, roomId: string): Promise<ProjectRoomRecord | null> {
    const [row] = await db
      .select()
      .from(schema.projectRoom)
      .where(and(eq(schema.projectRoom.projectId, projectId), eq(schema.projectRoom.id, roomId)))
      .limit(1);
    return row ?? null;
  },

  async createRoom(projectId: string, input: CreateProjectRoomInput): Promise<ProjectRoomRecord> {
    const [row] = await db
      .insert(schema.projectRoom)
      .values({
        projectId,
        roomTypeId: input.roomTypeId,
        name: input.name,
        description: input.description ?? null,
        sortOrder: input.sortOrder ?? 0,
        metadata: input.metadata ?? {},
      })
      .returning();
    if (!row) throw new Error('insert returned no row');
    return row;
  },

  async findRoomTypesBySlugs(slugs: string[]): Promise<TaxonomyTermRecord[]> {
    if (slugs.length === 0) return [];
    return db
      .select({
        id: schema.taxonomy.id,
        kind: schema.taxonomy.kind,
        slug: schema.taxonomy.slug,
        label: schema.taxonomy.label,
        metadata: schema.taxonomy.metadata,
      })
      .from(schema.taxonomy)
      .where(and(eq(schema.taxonomy.kind, 'room'), inArray(schema.taxonomy.slug, slugs)));
  },

  async createRooms(
    projectId: string,
    inputs: CreateProjectRoomInput[],
  ): Promise<ProjectRoomRecord[]> {
    if (inputs.length === 0) return [];
    const now = new Date();
    return db.transaction(async (tx) =>
      tx
        .insert(schema.projectRoom)
        .values(
          inputs.map((input) => ({
            projectId,
            roomTypeId: input.roomTypeId,
            name: input.name,
            description: input.description ?? null,
            sortOrder: input.sortOrder ?? 0,
            metadata: input.metadata ?? {},
            createdAt: now,
            updatedAt: now,
          })),
        )
        .returning(),
    );
  },

  async updateRoom(
    projectId: string,
    roomId: string,
    input: UpdateProjectRoomInput,
  ): Promise<ProjectRoomRecord | null> {
    const patch: Partial<typeof schema.projectRoom.$inferInsert> = {};
    if (input.roomTypeId !== undefined) patch.roomTypeId = input.roomTypeId;
    if (input.name !== undefined) patch.name = input.name;
    if (input.description !== undefined) patch.description = input.description;
    if (input.sortOrder !== undefined) patch.sortOrder = input.sortOrder;
    if (input.metadata !== undefined) patch.metadata = input.metadata;

    const [row] = await db
      .update(schema.projectRoom)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(schema.projectRoom.projectId, projectId), eq(schema.projectRoom.id, roomId)))
      .returning();
    return row ?? null;
  },

  async reorderRooms(
    projectId: string,
    input: ReorderProjectRoomsInput,
  ): Promise<ProjectRoomRecord[] | null> {
    const ids = input.rooms.map((room) => room.id);
    const existing = await db
      .select({ id: schema.projectRoom.id })
      .from(schema.projectRoom)
      .where(and(eq(schema.projectRoom.projectId, projectId), inArray(schema.projectRoom.id, ids)));
    if (existing.length !== ids.length) return null;

    await db.transaction(async (tx) => {
      for (const room of input.rooms) {
        await tx
          .update(schema.projectRoom)
          .set({ sortOrder: room.sortOrder, updatedAt: new Date() })
          .where(and(eq(schema.projectRoom.projectId, projectId), eq(schema.projectRoom.id, room.id)));
      }
    });

    return this.listRooms(projectId);
  },

  async deleteRoom(projectId: string, roomId: string): Promise<boolean> {
    const rows = await db
      .delete(schema.projectRoom)
      .where(and(eq(schema.projectRoom.projectId, projectId), eq(schema.projectRoom.id, roomId)))
      .returning({ id: schema.projectRoom.id });
    return rows.length > 0;
  },

  async findImage(projectId: string, imageId: string): Promise<ProjectImageAttachmentRecord | null> {
    const [row] = await db
      .select({
        id: schema.projectImage.id,
        projectId: schema.projectImage.projectId,
        roomId: schema.projectImage.roomId,
        status: schema.projectImage.status,
        sortOrder: schema.projectImage.sortOrder,
      })
      .from(schema.projectImage)
      .where(and(eq(schema.projectImage.projectId, projectId), eq(schema.projectImage.id, imageId)))
      .limit(1);
    return row ?? null;
  },

  async updateImageLink(
    projectId: string,
    imageId: string,
    input: LinkProjectImageInput,
  ): Promise<ProjectImageAttachmentRecord | null> {
    const patch: Partial<typeof schema.projectImage.$inferInsert> = {};
    if (input.roomId !== undefined) patch.roomId = input.roomId;
    if (input.sortOrder !== undefined) patch.sortOrder = input.sortOrder;

    const [row] = await db
      .update(schema.projectImage)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(schema.projectImage.projectId, projectId), eq(schema.projectImage.id, imageId)))
      .returning({
        id: schema.projectImage.id,
        projectId: schema.projectImage.projectId,
        roomId: schema.projectImage.roomId,
        status: schema.projectImage.status,
        sortOrder: schema.projectImage.sortOrder,
      });
    return row ?? null;
  },

  slugify,
};
