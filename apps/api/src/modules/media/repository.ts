import { db, schema, eq, asc } from '@repo/db';

/**
 * Data-access for media. The ONLY media layer that imports Drizzle.
 */
export type ProjectImageRecord = typeof schema.projectImage.$inferSelect;

export const mediaRepository = {
  /** Owning user of a project, via its designer profile. Null when the project is missing. */
  async findProjectOwner(projectId: string): Promise<{ ownerUserId: string } | null> {
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
  async findImageWithOwner(
    imageId: string,
  ): Promise<{ id: string; projectId: string; originalKey: string; ownerUserId: string } | null> {
    const [row] = await db
      .select({
        id: schema.projectImage.id,
        projectId: schema.projectImage.projectId,
        originalKey: schema.projectImage.originalKey,
        ownerUserId: schema.designerProfile.userId,
      })
      .from(schema.projectImage)
      .innerJoin(schema.project, eq(schema.projectImage.projectId, schema.project.id))
      .innerJoin(schema.designerProfile, eq(schema.project.designerId, schema.designerProfile.id))
      .where(eq(schema.projectImage.id, imageId))
      .limit(1);
    return row ?? null;
  },

  async listByProject(projectId: string): Promise<ProjectImageRecord[]> {
    return db
      .select()
      .from(schema.projectImage)
      .where(eq(schema.projectImage.projectId, projectId))
      .orderBy(asc(schema.projectImage.sortOrder), asc(schema.projectImage.createdAt));
  },
};
