import { and, db, desc, eq, schema, sql } from '@repo/db';

export const followingRepository = {
  async eligibility(userId: string, designerProfileId: string) {
    const [row] = await db
      .select({
        ownerId: schema.designerProfile.userId,
        ownMembership: sql<boolean>`exists(select 1 from ${schema.member} where ${schema.member.organizationId} = ${schema.designerProfile.orgId} and ${schema.member.userId} = ${userId})`,
      })
      .from(schema.designerProfile)
      .where(
        and(
          eq(schema.designerProfile.id, designerProfileId),
          eq(schema.designerProfile.status, 'active'),
        ),
      )
      .limit(1);
    return row ? { ownStudio: row.ownerId === userId || row.ownMembership } : null;
  },
  async follow(userId: string, designerProfileId: string) {
    const result = await db.execute(sql`
      insert into ${schema.designerFollow} (user_id, designer_profile_id)
      select ${userId}, ${schema.designerProfile.id} from ${schema.designerProfile}
      where ${schema.designerProfile.id} = ${designerProfileId}
        and ${schema.designerProfile.status} = 'active'
        and (${schema.designerProfile.userId} is null or ${schema.designerProfile.userId} <> ${userId})
        and not exists(select 1 from ${schema.member} where ${schema.member.organizationId} = ${schema.designerProfile.orgId} and ${schema.member.userId} = ${userId})
      on conflict (user_id, designer_profile_id) do update set user_id = excluded.user_id
      returning designer_profile_id
    `);
    return result.rows.length > 0;
  },
  async remove(userId: string, designerProfileId: string) {
    await db
      .delete(schema.designerFollow)
      .where(
        and(
          eq(schema.designerFollow.userId, userId),
          eq(schema.designerFollow.designerProfileId, designerProfileId),
        ),
      );
  },
  async state(userId: string, designerProfileId: string) {
    const [row] = await db
      .select({ id: schema.designerFollow.designerProfileId })
      .from(schema.designerFollow)
      .where(
        and(
          eq(schema.designerFollow.userId, userId),
          eq(schema.designerFollow.designerProfileId, designerProfileId),
        ),
      )
      .limit(1);
    return !!row;
  },
  async seen(userId: string, designerProfileId: string, seenThrough: Date) {
    // Clamp in PostgreSQL too, and never let a stale tab move the watermark backwards.
    await db
      .update(schema.designerFollow)
      .set({
        lastSeenAt: sql`greatest(${schema.designerFollow.lastSeenAt}, least(${seenThrough.toISOString()}::timestamptz, now()))`,
      })
      .where(
        and(
          eq(schema.designerFollow.userId, userId),
          eq(schema.designerFollow.designerProfileId, designerProfileId),
        ),
      );
  },
  async list(userId: string, limit: number, offset: number) {
    const where = and(
      eq(schema.designerFollow.userId, userId),
      eq(schema.designerProfile.status, 'active'),
    );
    const [items, [count]] = await Promise.all([
      db
        .select({
          designerProfileId: schema.designerProfile.id,
          displayName: schema.designerProfile.displayName,
          slug: sql<string>`coalesce(${schema.designerPortfolio.portfolioSlug}, ${schema.designerProfile.slug})`,
          logoImageId: schema.designerProfile.logoImageId,
          followedAt: schema.designerFollow.followedAt,
          profile: {
            displayName: schema.designerProfile.displayName,
            status: schema.designerProfile.status,
            logoImageId: schema.designerProfile.logoImageId,
            bio: schema.designerProfile.bio,
          },
          portfolio: {
            id: schema.designerPortfolio.id,
            publicLinkEnabled: schema.designerPortfolio.publicLinkEnabled,
            tagline: schema.designerPortfolio.tagline,
            showHero: schema.designerPortfolio.showHero,
            heroImageId: schema.designerPortfolio.heroImageId,
          },
          newProjectCount: sql<number>`(select count(*)::int from ${schema.project} where ${schema.project.designerId} = ${schema.designerProfile.id} and ${schema.project.status} = 'published' and ${schema.project.publishedAt} > ${schema.designerFollow.lastSeenAt} and ${schema.project.publishedAt} <= now())`,
        })
        .from(schema.designerFollow)
        .innerJoin(
          schema.designerProfile,
          eq(schema.designerFollow.designerProfileId, schema.designerProfile.id),
        )
        .leftJoin(
          schema.designerPortfolio,
          eq(schema.designerPortfolio.profileId, schema.designerProfile.id),
        )
        .where(where)
        .orderBy(desc(schema.designerFollow.followedAt), schema.designerFollow.designerProfileId)
        .limit(limit)
        .offset(offset),
      db
        .select({ total: sql<number>`count(*)::int` })
        .from(schema.designerFollow)
        .innerJoin(
          schema.designerProfile,
          eq(schema.designerFollow.designerProfileId, schema.designerProfile.id),
        )
        .where(where),
    ]);
    return { items, total: count?.total ?? 0 };
  },
};
