import { and, db, eq, inArray, schema } from '@repo/db';

export const savedProjectsRepository = {
  async savePublished(userId: string, projectId: string): Promise<boolean> {
    return db.transaction(async (tx) => {
      const [project] = await tx
        .select({ id: schema.project.id })
        .from(schema.project)
        .innerJoin(
          schema.designerProfile,
          eq(schema.project.designerId, schema.designerProfile.id),
        )
        .where(
          and(
            eq(schema.project.id, projectId),
            eq(schema.project.status, 'published'),
            eq(schema.designerProfile.status, 'active'),
          ),
        )
        .limit(1);

      if (!project) return false;

      await tx
        .insert(schema.savedProject)
        .values({ userId, projectId })
        .onConflictDoNothing({
          target: [schema.savedProject.userId, schema.savedProject.projectId],
        });
      return true;
    });
  },

  async remove(userId: string, projectId: string): Promise<void> {
    await db
      .delete(schema.savedProject)
      .where(
        and(
          eq(schema.savedProject.userId, userId),
          eq(schema.savedProject.projectId, projectId),
        ),
      );
  },

  async findSavedProjectIds(userId: string, projectIds: string[]): Promise<string[]> {
    if (projectIds.length === 0) return [];

    const rows = await db
      .select({ projectId: schema.savedProject.projectId })
      .from(schema.savedProject)
      .where(
        and(
          eq(schema.savedProject.userId, userId),
          inArray(schema.savedProject.projectId, projectIds),
        ),
      );
    return rows.map((row) => row.projectId);
  },
};
