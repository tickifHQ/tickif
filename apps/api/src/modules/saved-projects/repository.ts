import { and, db, eq, inArray, schema, sql } from '@repo/db';

export const savedProjectsRepository = {
  async savePublished(userId: string, projectId: string): Promise<boolean> {
    const result = await db.execute<{ projectId: string }>(sql`
      insert into ${schema.savedProject} (user_id, project_id)
      select ${userId}, ${schema.project.id}
      from ${schema.project}
      inner join ${schema.designerProfile}
        on ${schema.project.designerId} = ${schema.designerProfile.id}
      where ${schema.project.id} = ${projectId}
        and ${schema.project.status} = 'published'
        and ${schema.designerProfile.status} = 'active'
      on conflict (user_id, project_id)
      do update set user_id = excluded.user_id
      returning project_id as "projectId"
    `);
    return result.rows.length > 0;
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
