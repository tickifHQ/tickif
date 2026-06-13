import { db, schema, eq } from '@repo/db';

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
  }): Promise<ProjectImageRecord> {
    const [row] = await db
      .insert(schema.projectImage)
      .values({ projectId: input.projectId, originalKey: input.originalKey })
      .returning();
    if (!row) throw new Error('insert returned no row');
    return row;
  },
};
