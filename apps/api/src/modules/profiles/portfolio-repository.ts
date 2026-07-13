import { db, schema, eq, and, sql } from '@repo/db';

/**
 * Data-access for designer portfolio (E-222).
 * This is the ONLY layer that imports Drizzle.
 */

export type PortfolioRecord = typeof schema.designerPortfolio.$inferSelect;

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
   * Upsert portfolio. Creates a new row if one doesn't exist,
   * otherwise updates the existing row for the given profile.
   */
  async upsert(
    profileId: string,
    input: Partial<Omit<PortfolioRecord, 'id' | 'profileId' | 'createdAt'>>,
  ): Promise<PortfolioRecord> {
    const now = new Date();
    const [row] = await db
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
   * Transaction-aware upsert. Same logic as `upsert` but executes within
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

  /** Update an existing portfolio row by ID. */
  async update(
    id: string,
    patch: Partial<Omit<PortfolioRecord, 'id' | 'profileId' | 'createdAt'>>,
  ): Promise<PortfolioRecord | null> {
    const [row] = await db
      .update(schema.designerPortfolio)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(schema.designerPortfolio.id, id))
      .returning();
    return row ?? null;
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
   * Transaction-aware project ownership check. Same logic as `findProjectForDesigner`
   * but executes within the provided transaction handle.
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
      logoImageId: string | null;
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

  /** Find the designer profile for a user (delegation helper). */
  async findProfileByUserId(
    userId: string,
  ): Promise<{ id: string; orgId: string } | null> {
    const [row] = await db
      .select({ id: schema.designerProfile.id, orgId: schema.designerProfile.orgId })
      .from(schema.designerProfile)
      .where(eq(schema.designerProfile.userId, userId))
      .limit(1);
    return row ?? null;
  },

  /** Find project by ID with ownership check via designerId. */
  async findProjectForDesigner(
    projectId: string,
    designerId: string,
  ): Promise<{ id: string; status: string } | null> {
    const [row] = await db
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
};
