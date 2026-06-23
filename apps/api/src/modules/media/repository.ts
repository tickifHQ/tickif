import { inArray } from 'drizzle-orm';
import { db, schema, eq, and, asc } from '@repo/db';
import type { UpdateImageMetadataInput } from '@repo/contracts';

/**
 * Data-access for media. The ONLY media layer that imports Drizzle.
 */
export type ProjectImageRecord = typeof schema.projectImage.$inferSelect;
export type ProjectImageListItem = Pick<
  ProjectImageRecord,
  | 'id'
  | 'roomId'
  | 'status'
  | 'sortOrder'
  | 'themeSlugs'
  | 'materialSlugs'
  | 'finishSlugs'
  | 'tagSlugs'
  | 'width'
  | 'height'
  | 'derivatives'
>;

export const mediaRepository = {
  /** Owning user of a project, via its designer profile. Null when the project is missing. */
  async findProjectOwner(projectId: string): Promise<{ ownerUserId: string | null } | null> {
    const [row] = await db
      .select({ ownerUserId: schema.designerProfile.userId })
      .from(schema.project)
      .innerJoin(schema.designerProfile, eq(schema.project.designerId, schema.designerProfile.id))
      .where(eq(schema.project.id, projectId))
      .limit(1);
    return row ?? null;
  },

  async createProcessing(input: {
    projectId: string;
    originalKey: string;
    contentType: string;
  }): Promise<ProjectImageRecord> {
    const [row] = await db
      .insert(schema.projectImage)
      .values({
        projectId: input.projectId,
        originalKey: input.originalKey,
        contentType: input.contentType,
      })
      .returning();
    if (!row) throw new Error('insert returned no row');
    return row;
  },

  /** Image joined to its owning user (via project → designer). Null when the image is missing. */
  async findImageWithOwner(imageId: string): Promise<{
    id: string;
    projectId: string;
    originalKey: string;
    status: ProjectImageRecord['status'];
    ownerUserId: string | null;
  } | null> {
    const [row] = await db
      .select({
        id: schema.projectImage.id,
        projectId: schema.projectImage.projectId,
        originalKey: schema.projectImage.originalKey,
        status: schema.projectImage.status,
        ownerUserId: schema.designerProfile.userId,
      })
      .from(schema.projectImage)
      .innerJoin(schema.project, eq(schema.projectImage.projectId, schema.project.id))
      .innerJoin(schema.designerProfile, eq(schema.project.designerId, schema.designerProfile.id))
      .where(eq(schema.projectImage.id, imageId))
      .limit(1);
    return row ?? null;
  },

  async roomBelongsToProject(roomId: string, projectId: string): Promise<boolean> {
    const [row] = await db
      .select({ id: schema.projectRoom.id })
      .from(schema.projectRoom)
      .where(and(eq(schema.projectRoom.id, roomId), eq(schema.projectRoom.projectId, projectId)))
      .limit(1);
    return !!row;
  },

  async taxonomySlugsExist(
    kind: (typeof schema.taxonomyKindEnum.enumValues)[number],
    slugs: string[],
  ): Promise<boolean> {
    const uniqueSlugs = [...new Set(slugs)];
    if (uniqueSlugs.length === 0) return true;

    const rows = await db
      .select({ slug: schema.taxonomy.slug })
      .from(schema.taxonomy)
      .where(and(eq(schema.taxonomy.kind, kind), inArray(schema.taxonomy.slug, uniqueSlugs)));
    return rows.length === uniqueSlugs.length;
  },

  async updateMetadata(
    imageId: string,
    input: UpdateImageMetadataInput,
  ): Promise<ProjectImageRecord> {
    const patch: Partial<typeof schema.projectImage.$inferInsert> = {};
    if (input.roomId !== undefined) patch.roomId = input.roomId;
    if (input.sortOrder !== undefined) patch.sortOrder = input.sortOrder;
    if (input.themeSlugs !== undefined) patch.themeSlugs = input.themeSlugs;
    if (input.materialSlugs !== undefined) patch.materialSlugs = input.materialSlugs;
    if (input.finishSlugs !== undefined) patch.finishSlugs = input.finishSlugs;
    if (input.tagSlugs !== undefined) patch.tagSlugs = input.tagSlugs;

    const [row] = await db
      .update(schema.projectImage)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(schema.projectImage.id, imageId))
      .returning();
    if (!row) throw new Error('update returned no row');
    return row;
  },

  async listByProject(
    projectId: string,
    page: { limit: number; offset: number },
  ): Promise<ProjectImageListItem[]> {
    return db
      .select({
        id: schema.projectImage.id,
        roomId: schema.projectImage.roomId,
        status: schema.projectImage.status,
        sortOrder: schema.projectImage.sortOrder,
        themeSlugs: schema.projectImage.themeSlugs,
        materialSlugs: schema.projectImage.materialSlugs,
        finishSlugs: schema.projectImage.finishSlugs,
        tagSlugs: schema.projectImage.tagSlugs,
        width: schema.projectImage.width,
        height: schema.projectImage.height,
        derivatives: schema.projectImage.derivatives,
      })
      .from(schema.projectImage)
      .where(eq(schema.projectImage.projectId, projectId))
      .orderBy(asc(schema.projectImage.sortOrder), asc(schema.projectImage.createdAt))
      .limit(page.limit)
      .offset(page.offset);
  },
};
