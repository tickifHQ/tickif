import { db, schema, eq, and, sql } from '@repo/db';

/**
 * Data-access for profile completion checks.
 * This is the ONLY layer that imports Drizzle.
 */

export type DesignerProfileRecord = typeof schema.designerProfile.$inferSelect;

export const profilesRepository = {
  /** Find the designer profile owned by the given organization. */
  async findByOrgId(orgId: string): Promise<DesignerProfileRecord | null> {
    const [row] = await db
      .select()
      .from(schema.designerProfile)
      .where(eq(schema.designerProfile.orgId, orgId))
      .limit(1);
    return row ?? null;
  },

  /** Check if the user has linked a Google account. */
  async hasGoogleAccount(userId: string): Promise<boolean> {
    const [row] = await db
      .select({ id: schema.account.id })
      .from(schema.account)
      .where(and(eq(schema.account.userId, userId), eq(schema.account.providerId, 'google')))
      .limit(1);
    return !!row;
  },

  /** Check if the user belongs to any organization. */
  async hasOrganization(userId: string): Promise<string | null> {
    const [row] = await db
      .select({ orgId: schema.member.organizationId })
      .from(schema.member)
      .where(eq(schema.member.userId, userId))
      .limit(1);
    return row?.orgId ?? null;
  },

  /** Count footprint entries via SQL count(*) — no row streaming. */
  async countFootprintByKind(
    profileId: string,
    kind: (typeof schema.taxonomyKindEnum.enumValues)[number],
  ): Promise<number> {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.designerProfileFootprint)
      .innerJoin(
        schema.taxonomy,
        eq(schema.designerProfileFootprint.taxonomyId, schema.taxonomy.id),
      )
      .where(
        and(
          eq(schema.designerProfileFootprint.profileId, profileId),
          eq(schema.taxonomy.kind, kind),
        ),
      );
    return row?.count ?? 0;
  },

  /** Check if the designer has at least one project. */
  async hasProject(designerProfileId: string): Promise<boolean> {
    const [row] = await db
      .select({ id: schema.project.id })
      .from(schema.project)
      .where(eq(schema.project.designerId, designerProfileId))
      .limit(1);
    return !!row;
  },

  /**
   * Check if the user has verified contact info.
   * Requires phoneNumberVerified (not just presence) symmetrically with emailVerified.
   */
  async hasContact(userId: string): Promise<boolean> {
    const [row] = await db
      .select({
        phoneNumber: schema.user.phoneNumber,
        phoneNumberVerified: schema.user.phoneNumberVerified,
        email: schema.user.email,
        emailVerified: schema.user.emailVerified,
      })
      .from(schema.user)
      .where(eq(schema.user.id, userId))
      .limit(1);
    if (!row) return false;
    return (
      (!!row.phoneNumber && !!row.phoneNumberVerified) ||
      (!!row.email && row.emailVerified)
    );
  },
};
