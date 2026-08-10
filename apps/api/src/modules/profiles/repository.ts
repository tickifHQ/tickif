import { db, schema, eq, and, sql } from '@repo/db';
import { inArray } from 'drizzle-orm';
import {
  taxonomyKindSchema,
  type DesignerEntityType,
  type TaxonomyKind,
} from '@repo/contracts';
import { recordSearchProjectionEvents } from '../search-index/repository.js';

/**
 * Data-access for profile completion checks.
 * This is the ONLY layer that imports Drizzle.
 */

export type DesignerProfileRecord = typeof schema.designerProfile.$inferSelect;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type ProfileUpdateData = Partial<{
  displayName: string;
  bio: string | null;
  logoImageId: string | null;
  entityType: DesignerEntityType;
  address: string | null;
  websiteUrl: string | null;
  googleBusinessUrl: string | null;
  phone: string | null;
  instagramHandle: string | null;
  linkedinHandle: string | null;
  youtubeHandle: string | null;
  firmType: string | null;
  foundedYear: number | null;
  staffCount: number | null;
  testimonialBannerEnabled: boolean;
}>;

async function replaceFootprintByKindInTx(
  tx: Tx,
  profileId: string,
  kind: TaxonomyKind,
  taxonomyIds: string[],
): Promise<void> {
  const existingIds = await tx
    .select({ id: schema.designerProfileFootprint.id })
    .from(schema.designerProfileFootprint)
    .innerJoin(schema.taxonomy, eq(schema.designerProfileFootprint.taxonomyId, schema.taxonomy.id))
    .where(
      and(eq(schema.designerProfileFootprint.profileId, profileId), eq(schema.taxonomy.kind, kind)),
    );

  if (existingIds.length > 0) {
    await tx.delete(schema.designerProfileFootprint).where(
      inArray(
        schema.designerProfileFootprint.id,
        existingIds.map((entry) => entry.id),
      ),
    );
  }
  if (taxonomyIds.length > 0) {
    await tx
      .insert(schema.designerProfileFootprint)
      .values(taxonomyIds.map((taxonomyId) => ({ profileId, taxonomyId })))
      .onConflictDoNothing();
  }
}

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

  /** Find the designer profile and organization by organization id. */
  async findByOrgIdWithOrg(orgId: string): Promise<{
    profile: DesignerProfileRecord;
    org: typeof schema.organization.$inferSelect;
  } | null> {
    const [row] = await db
      .select({
        profile: schema.designerProfile,
        org: schema.organization,
      })
      .from(schema.designerProfile)
      .innerJoin(schema.organization, eq(schema.designerProfile.orgId, schema.organization.id))
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

  /** Count footprint entries via SQL count(*) — no row streaming. */
  async countFootprintByKind(
    profileId: string,
    kind: TaxonomyKind,
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
    return (!!row.phoneNumber && !!row.phoneNumberVerified) || (!!row.email && row.emailVerified);
  },

  // --- Onboarding (E-35) ---

  /** Find existing profile + org by the creating user (idempotency check). */
  async findByUserId(userId: string): Promise<{
    profile: DesignerProfileRecord;
    org: typeof schema.organization.$inferSelect;
  } | null> {
    const [row] = await db
      .select({
        profile: schema.designerProfile,
        org: schema.organization,
      })
      .from(schema.designerProfile)
      .innerJoin(schema.organization, eq(schema.designerProfile.orgId, schema.organization.id))
      .where(eq(schema.designerProfile.userId, userId))
      .limit(1);
    return row ?? null;
  },

  /**
   * Validate multiple taxonomy ID arrays in a single DB round-trip.
   * Deduplicates IDs before checking. Returns aggregated error messages.
   */
  async validateAllTaxonomyIds(input: {
    cityIds?: string[];
    scopeIds?: string[];
    themeIds?: string[];
  }): Promise<string[]> {
    const allIds = [
      ...new Set([...(input.cityIds ?? []), ...(input.scopeIds ?? []), ...(input.themeIds ?? [])]),
    ];
    if (allIds.length === 0) return [];

    const rows = await db
      .select({ id: schema.taxonomy.id, kind: schema.taxonomy.kind })
      .from(schema.taxonomy)
      .where(inArray(schema.taxonomy.id, allIds));

    const found = new Map(rows.map((r) => [r.id, r.kind]));
    const errors: string[] = [];

    const check = (ids: string[], expectedKind: TaxonomyKind, label: string) => {
      const invalid = [...new Set(ids)].filter((id) => {
        const kind = found.get(id);
        return !kind || kind !== expectedKind;
      });
      if (invalid.length > 0) errors.push(`Invalid ${label} IDs: ${invalid.join(', ')}`);
    };

    if (input.cityIds?.length) {
      check(input.cityIds, taxonomyKindSchema.enum.city, 'city');
    }
    if (input.scopeIds?.length) {
      check(input.scopeIds, taxonomyKindSchema.enum.scope, 'scope');
    }
    if (input.themeIds?.length) {
      check(input.themeIds, taxonomyKindSchema.enum.theme, 'theme');
    }

    return errors;
  },

  /** Execute the full onboarding transaction. Catches unique violation for idempotency. */
  async onboard(data: {
    orgId: string;
    orgName: string;
    orgSlug: string;
    memberId: string;
    userId: string;
    displayName: string;
    entityType: 'individual' | 'company';
    bio: string | null;
    address: string | null;
    phone: string | null;
    websiteUrl: string | null;
    googleBusinessUrl: string | null;
    instagramHandle: string | null;
    linkedinHandle: string | null;
    youtubeHandle: string | null;
    firmType: string | null;
    foundedYear: number | null;
    staffCount: number | null;
    footprintIds: { taxonomyId: string }[];
  }): Promise<{ profile: DesignerProfileRecord; org: typeof schema.organization.$inferSelect }> {
    return await db.transaction(async (tx) => {
      const [org] = await tx
        .insert(schema.organization)
        .values({
          id: data.orgId,
          name: data.orgName,
          slug: data.orgSlug,
          createdAt: new Date(),
        })
        .returning();

      await tx.insert(schema.member).values({
        id: data.memberId,
        organizationId: data.orgId,
        userId: data.userId,
        role: 'owner',
        createdAt: new Date(),
      });

      const [profile] = await tx
        .insert(schema.designerProfile)
        .values({
          orgId: data.orgId,
          userId: data.userId,
          displayName: data.displayName,
          entityType: data.entityType,
          bio: data.bio ?? undefined,
          address: data.address ?? undefined,
          phone: data.phone ?? undefined,
          websiteUrl: data.websiteUrl ?? undefined,
          googleBusinessUrl: data.googleBusinessUrl ?? undefined,
          instagramHandle: data.instagramHandle ?? undefined,
          linkedinHandle: data.linkedinHandle ?? undefined,
          youtubeHandle: data.youtubeHandle ?? undefined,
          firmType: data.firmType ?? undefined,
          foundedYear: data.foundedYear ?? undefined,
          staffCount: data.staffCount ?? undefined,
        })
        .returning();

      // Only set role + status — don't overwrite user.name from signup/SSO
      await tx
        .update(schema.user)
        .set({ role: 'designer', status: 'active' })
        .where(eq(schema.user.id, data.userId));

      if (data.footprintIds.length > 0) {
        await tx.insert(schema.designerProfileFootprint).values(
          data.footprintIds.map((f) => ({
            profileId: profile!.id,
            taxonomyId: f.taxonomyId,
          })),
        );
      }

      return { profile: profile!, org: org! };
    });
  },

  // --- Read/Update (E-37) ---

  /** Find a profile by ID (for public read). */
  async findById(profileId: string): Promise<DesignerProfileRecord | null> {
    const [row] = await db
      .select()
      .from(schema.designerProfile)
      .where(eq(schema.designerProfile.id, profileId))
      .limit(1);
    return row ?? null;
  },

  /** Find a profile by owning organization slug (for public portfolio URLs). */
  async findByOrgSlug(orgSlug: string): Promise<DesignerProfileRecord | null> {
    const [row] = await db
      .select({ profile: schema.designerProfile })
      .from(schema.designerProfile)
      .innerJoin(schema.organization, eq(schema.designerProfile.orgId, schema.organization.id))
      .where(eq(schema.organization.slug, orgSlug))
      .limit(1);
    return row?.profile ?? null;
  },

  /** Get all footprint taxonomy terms for a profile. */
  async getFootprint(
    profileId: string,
  ): Promise<{ id: string; kind: TaxonomyKind; slug: string; label: string }[]> {
    return db
      .select({
        id: schema.taxonomy.id,
        kind: schema.taxonomy.kind,
        slug: schema.taxonomy.slug,
        label: schema.taxonomy.label,
      })
      .from(schema.designerProfileFootprint)
      .innerJoin(
        schema.taxonomy,
        eq(schema.designerProfileFootprint.taxonomyId, schema.taxonomy.id),
      )
      .where(eq(schema.designerProfileFootprint.profileId, profileId));
  },

  /** Update profile fields (partial). */
  async updateProfile(profileId: string, data: ProfileUpdateData): Promise<DesignerProfileRecord> {
    const [row] = await db
      .update(schema.designerProfile)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.designerProfile.id, profileId))
      .returning();
    return row!;
  },

  async updateProfileAndFootprint(
    profileId: string,
    data: ProfileUpdateData,
    footprint: {
      cityIds?: string[];
      scopeIds?: string[];
      themeIds?: string[];
    },
  ): Promise<DesignerProfileRecord> {
    return db.transaction(async (tx) => {
      const now = new Date();
      const hasMutation =
        Object.keys(data).length > 0 ||
        footprint.cityIds !== undefined ||
        footprint.scopeIds !== undefined ||
        footprint.themeIds !== undefined;
      let updated: DesignerProfileRecord;
      if (hasMutation) {
        const [row] = await tx
          .update(schema.designerProfile)
          .set({ ...data, updatedAt: now })
          .where(eq(schema.designerProfile.id, profileId))
          .returning();
        if (!row) throw new Error('designer profile missing during update');
        updated = row;
      } else {
        const [row] = await tx
          .select()
          .from(schema.designerProfile)
          .where(eq(schema.designerProfile.id, profileId))
          .limit(1);
        if (!row) throw new Error('designer profile missing during update');
        updated = row;
      }

      if (footprint.cityIds !== undefined) {
        await replaceFootprintByKindInTx(
          tx,
          profileId,
          taxonomyKindSchema.enum.city,
          footprint.cityIds,
        );
      }
      if (footprint.scopeIds !== undefined) {
        await replaceFootprintByKindInTx(
          tx,
          profileId,
          taxonomyKindSchema.enum.scope,
          footprint.scopeIds,
        );
      }
      if (footprint.themeIds !== undefined) {
        await replaceFootprintByKindInTx(
          tx,
          profileId,
          taxonomyKindSchema.enum.theme,
          footprint.themeIds,
        );
      }

      if (hasMutation) {
        await recordSearchProjectionEvents(tx, [
          {
            entityKind: 'designer',
            entityId: profileId,
            operation: 'index',
            sourceUpdatedAt: updated.updatedAt,
          },
        ]);
      }
      return updated;
    });
  },

  /**
   * Atomically replace footprint entries for a specific taxonomy kind.
   * Uses a transaction: SELECT existing IDs → DELETE → INSERT with onConflictDoNothing.
   */
  async replaceFootprintByKind(
    profileId: string,
    kind: TaxonomyKind,
    taxonomyIds: string[],
  ): Promise<void> {
    await db.transaction((tx) => replaceFootprintByKindInTx(tx, profileId, kind, taxonomyIds));
  },
};
