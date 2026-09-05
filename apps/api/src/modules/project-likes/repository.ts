import { and, db, eq, inArray, schema, sql } from '@repo/db';

const stateColumns = (userId: string | null) => ({
  projectId: schema.project.id,
  likeCount: sql<number>`(select count(*) from ${schema.projectLike}
    where ${schema.projectLike.projectId} = ${schema.project.id})`.mapWith(Number),
  liked: sql<boolean>`exists(select 1 from ${schema.projectLike}
    where ${schema.projectLike.projectId} = ${schema.project.id}
    and ${schema.projectLike.userId} = ${userId})`,
});

export const projectLikesRepository = {
  async state(userId: string | null, projectIds: string[]) {
    if (projectIds.length === 0) return [];
    return db.select(stateColumns(userId)).from(schema.project)
      .innerJoin(schema.designerProfile, eq(schema.project.designerId, schema.designerProfile.id))
      .where(and(
        inArray(schema.project.id, projectIds),
        eq(schema.project.status, 'published'),
        eq(schema.designerProfile.status, 'active'),
      ));
  },

  async setLiked(userId: string, projectId: string, liked: boolean) {
    return db.transaction(async (tx) => {
      // All likes/unlikes of this project serialize here. Holding the designer's
      // shared lock also prevents suspension racing the eligibility check/write.
      const eligible = await tx.execute(sql`
        select ${schema.project.id} from ${schema.project}
        inner join ${schema.designerProfile}
          on ${schema.project.designerId} = ${schema.designerProfile.id}
        where ${schema.project.id} = ${projectId}
          and ${schema.project.status} = 'published'
          and ${schema.designerProfile.status} = 'active'
        for update of ${schema.project} for share of ${schema.designerProfile}
      `);
      if (eligible.rows.length === 0) return null;

      if (liked) {
        await tx.insert(schema.projectLike).values({ userId, projectId }).onConflictDoNothing();
      } else {
        await tx.delete(schema.projectLike).where(and(
          eq(schema.projectLike.userId, userId), eq(schema.projectLike.projectId, projectId),
        ));
      }
      // Read after the mutation in this transaction, never increment a cached
      // counter. Unique rows make retries idempotent and prevent count drift.
      const [state] = await tx.select(stateColumns(userId)).from(schema.project)
        .where(eq(schema.project.id, projectId));
      return state ?? null;
    });
  },
};
