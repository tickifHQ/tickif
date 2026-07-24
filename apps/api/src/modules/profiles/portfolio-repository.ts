import { db, schema, eq, and, or, sql } from '@repo/db';
import type { DesignerProfileRecord } from './repository.js';

/**
 * Data-access for designer portfolio (E-222).
 * This is the ONLY layer that imports Drizzle.
 */

export type PortfolioRecord = typeof schema.designerPortfolio.$inferSelect;

/** Everything needed to resolve a public `/d/{slug}` portfolio URL. */
export type PublicPortfolioRecord = {
  profile: DesignerProfileRecord;
  orgSlug: string;
  /** Null when the designer has never opened the portfolio settings page. */
  portfolio: PortfolioRecord | null;
};

/**
 * Transaction handle type. Exported so the service layer can reference it
 * in method signatures without importing drizzle-orm directly.
 */
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Wraps the Drizzle `db.transaction()` call in a generic helper that the
 * service layer can import without depending on @repo/db or drizzle-orm.
 */
export async function withTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(fn);
}

const RESERVED_SLUGS = new Set([
  'admin', 'api', 'login', 'designer', 'dashboard', 'auth', 'help',
  'support', 'pricing', 'projects', 'settings', 'profile', 'portfolio',
  'onboarding', 'billing', 'analytics', 'reviews', 'leads', 'team',
  'about', 'contact', 'terms', 'privacy', 'blog', 'docs', 'status',
  'signup', 'signin', 'register', 'logout', 'app',
]);

export const portfolioRepository = {
  /** Find portfolio by designer profile ID. */
  async findByProfileId(profileId: string): Promise<PortfolioRecord | null> {
    const [row] = await db
      .select()
      .from(schema.designerPortfolio)
      .where(eq(schema.designerPortfolio.profileId, profileId))
      .limit(1);
    return row ?? null;
  },

  /** Find portfolio by slug. */
  async findBySlug(slug: string): Promise<PortfolioRecord | null> {
    const [row] = await db
      .select()
      .from(schema.designerPortfolio)
      .where(eq(schema.designerPortfolio.portfolioSlug, slug))
      .limit(1);
    return row ?? null;
  },

  /**
   * Resolve a public `/d/{slug}` URL to its profile, org slug, and portfolio row.
   *
   * Matches the designer-chosen `portfolioSlug` **or** the owning organization
   * slug, so share links minted before the designer picked a custom slug keep
   * working. A `portfolioSlug` hit wins if both could match. The portfolio join
   * is a LEFT JOIN because designers who never opened the settings page have no
   * row yet — the service falls back to the column defaults.
   */
  async findPublicBySlug(slug: string): Promise<PublicPortfolioRecord | null> {
    const [row] = await db
      .select({
        profile: schema.designerProfile,
        orgSlug: schema.organization.slug,
        portfolio: schema.designerPortfolio,
      })
      .from(schema.designerProfile)
      .innerJoin(schema.organization, eq(schema.designerProfile.orgId, schema.organization.id))
      .leftJoin(
        schema.designerPortfolio,
        eq(schema.designerPortfolio.profileId, schema.designerProfile.id),
      )
      .where(
        or(eq(schema.designerPortfolio.portfolioSlug, slug), eq(schema.organization.slug, slug)),
      )
      .orderBy(sql`case when ${schema.designerPortfolio.portfolioSlug} = ${slug} then 0 else 1 end`)
      .limit(1);
    if (!row) return null;
    return { profile: row.profile, orgSlug: row.orgSlug, portfolio: row.portfolio };
  },

  /** Title of a published project owned by this designer, for the featured quote. */
  async findPublishedProjectTitle(projectId: string, designerId: string): Promise<string | null> {
    const [row] = await db
      .select({ title: schema.project.title })
      .from(schema.project)
      .where(
        and(
          eq(schema.project.id, projectId),
          eq(schema.project.designerId, designerId),
          eq(schema.project.status, 'published'),
        ),
      )
      .limit(1);
    return row?.title ?? null;
  },

  /** City footprint labels for a profile, in taxonomy display order. */
  async findCityLabels(profileId: string): Promise<string[]> {
    const rows = await db
      .select({ label: schema.taxonomy.label })
      .from(schema.designerProfileFootprint)
      .innerJoin(
        schema.taxonomy,
        eq(schema.designerProfileFootprint.taxonomyId, schema.taxonomy.id),
      )
      .where(
        and(
          eq(schema.designerProfileFootprint.profileId, profileId),
          eq(schema.taxonomy.kind, 'city'),
          eq(schema.taxonomy.isActive, true),
        ),
      )
      .orderBy(schema.taxonomy.sortOrder, schema.taxonomy.label);
    return rows.map((r) => r.label);
  },

  /** Organization slug for a profile's owning org — used to build the canonical URL. */
  async findOrgSlug(orgId: string): Promise<string | null> {
    const [row] = await db
      .select({ slug: schema.organization.slug })
      .from(schema.organization)
      .where(eq(schema.organization.id, orgId))
      .limit(1);
    return row?.slug ?? null;
  },

  /** Create a new portfolio row for a profile. */
  async create(profileId: string): Promise<PortfolioRecord> {
    const [row] = await db
      .insert(schema.designerPortfolio)
      .values({ profileId })
      .returning();
    if (!row) throw new Error('insert returned no row');
    return row;
  },

  /**
   * Find-or-create: returns the existing portfolio without mutating updatedAt,
   * or inserts a new row with defaults. Handles race via unique violation catch.
   */
  async findOrCreate(profileId: string): Promise<PortfolioRecord> {
    const existing = await this.findByProfileId(profileId);
    if (existing) return existing;

    try {
      return await this.create(profileId);
    } catch (err) {
      // Race condition: another request created it between find and create
      // Check both the error and its cause (Drizzle wraps PG errors)
      const candidates: unknown[] = [err];
      if (err instanceof Error && err.cause) candidates.push(err.cause);
      const isRace = candidates.some(
        (c) =>
          typeof c === 'object' &&
          c !== null &&
          'code' in c &&
          (c as { code?: unknown }).code === '23505',
      );
      if (isRace) {
        const row = await this.findByProfileId(profileId);
        if (row) return row;
      }
      throw err;
    }
  },

  /**
   * Transaction-aware find-or-create. Returns the existing portfolio row
   * without mutating it (no updatedAt bump), or inserts a new row with
   * defaults. Races are handled via onConflictDoNothing + re-select.
   */
  async findOrCreateInTx(tx: Tx, profileId: string): Promise<PortfolioRecord> {
    const [existing] = await tx
      .select()
      .from(schema.designerPortfolio)
      .where(eq(schema.designerPortfolio.profileId, profileId))
      .limit(1);
    if (existing) return existing;

    const [inserted] = await tx
      .insert(schema.designerPortfolio)
      .values({ profileId })
      .onConflictDoNothing()
      .returning();
    if (inserted) return inserted;

    // Concurrent insert won the race — re-select the committed row
    const [row] = await tx
      .select()
      .from(schema.designerPortfolio)
      .where(eq(schema.designerPortfolio.profileId, profileId))
      .limit(1);
    if (!row) throw new Error('portfolio row missing after conflict');
    return row;
  },

  /**
   * Transaction-aware upsert. Creates a new row if one doesn't exist,
   * otherwise updates the existing row for the given profile. Executes within
   * the provided transaction handle so multi-table writes are atomic.
   */
  async upsertInTx(
    tx: Tx,
    profileId: string,
    input: Partial<Omit<PortfolioRecord, 'id' | 'profileId' | 'createdAt'>>,
  ): Promise<PortfolioRecord> {
    const now = new Date();
    const [row] = await tx
      .insert(schema.designerPortfolio)
      .values({
        profileId,
        ...input,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: schema.designerPortfolio.profileId,
        set: { ...input, updatedAt: now },
      })
      .returning();
    return row!;
  },

  /**
   * Check if a portfolio slug is available.
   * Optionally excludes a specific profile (for the owner's own slug).
   */
  async isSlugAvailable(slug: string, excludeProfileId?: string): Promise<boolean> {
    if (RESERVED_SLUGS.has(slug)) return false;

    const conditions = [eq(schema.designerPortfolio.portfolioSlug, slug)];
    if (excludeProfileId) {
      conditions.push(
        sql`${schema.designerPortfolio.profileId} != ${excludeProfileId}`,
      );
    }
    const [row] = await db
      .select({ id: schema.designerPortfolio.id })
      .from(schema.designerPortfolio)
      .where(and(...conditions))
      .limit(1);
    return !row;
  },

  /** Check if a slug is reserved. */
  isReservedSlug(slug: string): boolean {
    return RESERVED_SLUGS.has(slug);
  },

  /**
   * Transaction-aware slug availability check. Same logic as `isSlugAvailable`
   * but executes within the provided transaction handle to prevent TOCTOU races.
   */
  async isSlugAvailableInTx(
    tx: Tx,
    slug: string,
    excludeProfileId?: string,
  ): Promise<boolean> {
    if (RESERVED_SLUGS.has(slug)) return false;

    const conditions = [eq(schema.designerPortfolio.portfolioSlug, slug)];
    if (excludeProfileId) {
      conditions.push(
        sql`${schema.designerPortfolio.profileId} != ${excludeProfileId}`,
      );
    }
    const [row] = await tx
      .select({ id: schema.designerPortfolio.id })
      .from(schema.designerPortfolio)
      .where(and(...conditions))
      .limit(1);
    return !row;
  },

  /**
   * Transaction-aware project ownership check: finds a project by ID only if
   * it belongs to the given designer. Executes within the provided transaction.
   */
  async findProjectForDesignerInTx(
    tx: Tx,
    projectId: string,
    designerId: string,
  ): Promise<{ id: string; status: string } | null> {
    const [row] = await tx
      .select({
        id: schema.project.id,
        status: schema.project.status,
      })
      .from(schema.project)
      .where(
        and(eq(schema.project.id, projectId), eq(schema.project.designerId, designerId)),
      )
      .limit(1);
    return row ?? null;
  },

  /**
   * Transaction-aware profile update. Updates designer_profile fields within the
   * provided transaction so multi-table writes are atomic.
   */
  async updateProfileInTx(
    tx: Tx,
    profileId: string,
    data: Partial<{
      displayName: string;
      bio: string | null;
      websiteUrl: string | null;
      instagramHandle: string | null;
      linkedinHandle: string | null;
      youtubeHandle: string | null;
    }>,
  ): Promise<void> {
    await tx
      .update(schema.designerProfile)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.designerProfile.id, profileId));
  },

  /**
   * Compare-and-set: clear logoImageId only if it still matches the expected value.
   * Returns true if the update matched a row, false if another request already changed it.
   */
  async clearLogoIfMatch(profileId: string, expectedKey: string): Promise<boolean> {
    const result = await db
      .update(schema.designerProfile)
      .set({ logoImageId: null, updatedAt: new Date() })
      .where(
        and(
          eq(schema.designerProfile.id, profileId),
          eq(schema.designerProfile.logoImageId, expectedKey),
        ),
      )
      .returning({ id: schema.designerProfile.id });
    return result.length > 0;
  },

  /**
   * Compare-and-set: set logoImageId only if it still matches the expected previous value.
   * Returns true if the update matched, false if concurrent modification occurred.
   */
  async setLogoIfMatch(
    profileId: string,
    expectedPreviousKey: string | null,
    newKey: string,
  ): Promise<boolean> {
    const condition = expectedPreviousKey
      ? and(
          eq(schema.designerProfile.id, profileId),
          eq(schema.designerProfile.logoImageId, expectedPreviousKey),
        )
      : and(
          eq(schema.designerProfile.id, profileId),
          sql`${schema.designerProfile.logoImageId} IS NULL`,
        );

    const result = await db
      .update(schema.designerProfile)
      .set({ logoImageId: newKey, updatedAt: new Date() })
      .where(condition!)
      .returning({ id: schema.designerProfile.id });
    return result.length > 0;
  },
};
