import { db, schema, eq, and, or, sql } from '@repo/db';
import type { DesignerProfileRecord } from './repository.js';
import { recordSearchProjectionEvents } from '../search-index/repository.js';

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
  'admin',
  'api',
  'login',
  'designer',
  'dashboard',
  'auth',
  'help',
  'support',
  'pricing',
  'projects',
  'settings',
  'profile',
  'portfolio',
  'onboarding',
  'billing',
  'analytics',
  'reviews',
  'leads',
  'team',
  'about',
  'contact',
  'terms',
  'privacy',
  'blog',
  'docs',
  'status',
  'signup',
  'signin',
  'register',
  'logout',
  'app',
]);

/** Either a pooled connection or an open transaction — both satisfy the query builder. */
type Handle = typeof db | Tx;

/**
 * Is `slug` free for `excludeProfileId` to claim?
 *
 * `findPublicBySlug` resolves `/d/{slug}` against `designer_portfolio.portfolio_slug`
 * **or** `organization.slug`, so the two share one namespace and both have to be
 * checked here. Checking only the portfolio table would let a designer claim another
 * org's slug and, because the resolver ranks a `portfolio_slug` match first, serve
 * their own portfolio at that org's established public URL — or 404 it outright by
 * also switching `publicLinkEnabled` off.
 *
 * Best-effort: no DB constraint can span the two tables, so a concurrent org rename
 * can still collide. The unique index on `portfolio_slug` covers the common race;
 * the org half is rare enough to leave to the resolver's deterministic ordering.
 */
async function slugAvailable(
  handle: Handle,
  slug: string,
  excludeProfileId?: string,
): Promise<boolean> {
  if (RESERVED_SLUGS.has(slug)) return false;

  const portfolioConditions = [eq(schema.designerPortfolio.portfolioSlug, slug)];
  if (excludeProfileId) {
    portfolioConditions.push(sql`${schema.designerPortfolio.profileId} != ${excludeProfileId}`);
  }
  const [portfolioHit] = await handle
    .select({ id: schema.designerPortfolio.id })
    .from(schema.designerPortfolio)
    .where(and(...portfolioConditions))
    .limit(1);
  if (portfolioHit) return false;

  // A designer's own org slug stays claimable: it already resolves to them, so
  // typing it into the custom-slug field should not report a conflict with itself.
  const orgConditions = [eq(schema.organization.slug, slug)];
  if (excludeProfileId) {
    orgConditions.push(
      sql`${schema.organization.id} != (
        select ${schema.designerProfile.orgId} from ${schema.designerProfile}
        where ${schema.designerProfile.id} = ${excludeProfileId}
      )`,
    );
  }
  const [orgHit] = await handle
    .select({ id: schema.organization.id })
    .from(schema.organization)
    .where(and(...orgConditions))
    .limit(1);
  return !orgHit;
}

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
   *
   * Visibility is filtered here rather than only in the service so the resolver is
   * total: an ineligible candidate yields to the next one instead of collapsing the
   * result set and 404ing. Without that, a designer who squats a slug and disables
   * their public link takes the rightful owner's page down with them. `slugAvailable`
   * is the primary guard against the squat; this keeps the read path honest anyway.
   * `coalesce(..., true)` preserves "no row means never configured, so enabled".
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
        and(
          or(eq(schema.designerPortfolio.portfolioSlug, slug), eq(schema.organization.slug, slug)),
          eq(schema.designerProfile.status, 'active'),
          sql`coalesce(${schema.designerPortfolio.publicLinkEnabled}, true)`,
        ),
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
    const [row] = await db.insert(schema.designerPortfolio).values({ profileId }).returning();
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
    return slugAvailable(db, slug, excludeProfileId);
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
    return slugAvailable(tx, slug, excludeProfileId);
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
      .where(and(eq(schema.project.id, projectId), eq(schema.project.designerId, designerId)))
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
    const now = new Date();
    await tx
      .update(schema.designerProfile)
      .set({ ...data, updatedAt: now })
      .where(eq(schema.designerProfile.id, profileId));
    await recordSearchProjectionEvents(tx, [
      {
        entityKind: 'designer',
        entityId: profileId,
        operation: 'index',
        sourceUpdatedAt: now,
      },
    ]);
  },

  /**
   * Compare-and-set: clear logoImageId only if it still matches the expected value.
   * Returns true if the update matched a row, false if another request already changed it.
   */
  async clearLogoIfMatch(profileId: string, expectedKey: string): Promise<boolean> {
    return db.transaction(async (tx) => {
      const now = new Date();
      const result = await tx
        .update(schema.designerProfile)
        .set({ logoImageId: null, updatedAt: now })
        .where(
          and(
            eq(schema.designerProfile.id, profileId),
            eq(schema.designerProfile.logoImageId, expectedKey),
          ),
        )
        .returning({ id: schema.designerProfile.id });
      if (result.length === 0) return false;
      await recordSearchProjectionEvents(tx, [
        {
          entityKind: 'designer',
          entityId: profileId,
          operation: 'index',
          sourceUpdatedAt: now,
        },
      ]);
      return true;
    });
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

    return db.transaction(async (tx) => {
      const now = new Date();
      const result = await tx
        .update(schema.designerProfile)
        .set({ logoImageId: newKey, updatedAt: now })
        .where(condition)
        .returning({ id: schema.designerProfile.id });
      if (result.length === 0) return false;
      await recordSearchProjectionEvents(tx, [
        {
          entityKind: 'designer',
          entityId: profileId,
          operation: 'index',
          sourceUpdatedAt: now,
        },
      ]);
      return true;
    });
  },
};
