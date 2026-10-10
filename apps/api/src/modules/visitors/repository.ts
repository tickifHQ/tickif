import {
  ACCOUNT_STATUS,
  PLATFORM_ROLE,
  type UpsertVisitorProfileInput,
  type VisitorFeedPreferencesInput,
} from '@repo/contracts';
import { and, db, eq, schema, sql } from '@repo/db';
import { VisitorProfileAccessDeniedError, VisitorProfileConstraintError } from './errors.js';

export type VisitorProfileRecord = typeof schema.visitorProfile.$inferSelect;

function databaseErrorCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  if ('code' in error && typeof error.code === 'string') return error.code;
  return 'cause' in error ? databaseErrorCode(error.cause) : null;
}

export const visitorsRepository = {
  async findByUserId(userId: string): Promise<VisitorProfileRecord | null> {
    const [row] = await db
      .select()
      .from(schema.visitorProfile)
      .where(eq(schema.visitorProfile.userId, userId))
      .limit(1);
    return row ?? null;
  },

  async upsertCompleted(
    userId: string,
    input: UpsertVisitorProfileInput | VisitorFeedPreferencesInput,
  ): Promise<VisitorProfileRecord> {
    try {
      return await db.transaction(async (tx) => {
        const now = new Date();
        const [account] = await tx
          .select({
            role: schema.user.role,
            status: schema.user.status,
            banned: schema.user.banned,
            banExpires: schema.user.banExpires,
          })
          .from(schema.user)
          .where(eq(schema.user.id, userId))
          .limit(1)
          .for('update');
        const isBanned =
          account?.banned === true && (!account.banExpires || account.banExpires > now);
        const canWrite =
          account?.role === PLATFORM_ROLE.VISITOR &&
          (account.status === ACCOUNT_STATUS.PENDING || account.status === ACCOUNT_STATUS.ACTIVE) &&
          !isBanned;
        if (!canWrite) throw new VisitorProfileAccessDeniedError();

        if ('homeType' in input && input.cityId) {
          const [city] = await tx
            .select()
            .from(schema.taxonomy)
            .where(
              and(
                eq(schema.taxonomy.id, input.cityId),
                eq(schema.taxonomy.kind, 'city'),
                eq(schema.taxonomy.isActive, true),
              ),
            )
            .for('share');
          if (!city) throw new VisitorProfileConstraintError();
          if (input.localityId) {
            const [locality] = await tx
              .select()
              .from(schema.taxonomy)
              .where(
                and(
                  eq(schema.taxonomy.id, input.localityId),
                  eq(schema.taxonomy.kind, 'locality'),
                  eq(schema.taxonomy.parentId, city.id),
                  eq(schema.taxonomy.isActive, true),
                ),
              )
              .for('share');
            if (!locality) throw new VisitorProfileConstraintError();
          }
        }

        const fields =
          'homeType' in input
            ? { homeType: input.homeType, cityId: input.cityId, localityId: input.localityId }
            : { address: input.address, whatsappNumber: input.whatsappNumber };

        const [profile] = await tx
          .insert(schema.visitorProfile)
          .values({
            userId,
            ...fields,
            onboardingCompletedAt: now,
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: schema.visitorProfile.userId,
            set: {
              ...fields,
              onboardingCompletedAt: sql`coalesce(${schema.visitorProfile.onboardingCompletedAt}, ${now})`,
              updatedAt: now,
            },
          })
          .returning();

        if (!profile) throw new Error('visitor profile upsert returned no row');

        // Completion is deliberately data-independent: both nullable fields may be skipped.
        await tx
          .update(schema.user)
          .set({ status: ACCOUNT_STATUS.ACTIVE, updatedAt: now })
          .where(and(eq(schema.user.id, userId), eq(schema.user.status, ACCOUNT_STATUS.PENDING)));

        return profile;
      });
    } catch (error) {
      if (['23514', '23503'].includes(databaseErrorCode(error) ?? ''))
        throw new VisitorProfileConstraintError();
      throw error;
    }
  },

  async findLocation(cityId: string | null, localityId: string | null) {
    if (!cityId) return { city: null, locality: null };
    const [city] = await db
      .select({
        id: schema.taxonomy.id,
        slug: schema.taxonomy.slug,
        label: schema.taxonomy.label,
        parentId: schema.taxonomy.parentId,
      })
      .from(schema.taxonomy)
      .where(
        and(
          eq(schema.taxonomy.id, cityId),
          eq(schema.taxonomy.kind, 'city'),
          eq(schema.taxonomy.isActive, true),
        ),
      )
      .limit(1);
    if (!city) return { city: null, locality: null };
    const [locality] = localityId
      ? await db
          .select({
            id: schema.taxonomy.id,
            slug: schema.taxonomy.slug,
            label: schema.taxonomy.label,
            parentId: schema.taxonomy.parentId,
          })
          .from(schema.taxonomy)
          .where(
            and(
              eq(schema.taxonomy.id, localityId),
              eq(schema.taxonomy.kind, 'locality'),
              eq(schema.taxonomy.parentId, cityId),
              eq(schema.taxonomy.isActive, true),
            ),
          )
          .limit(1)
      : [];
    return { city, locality: locality ?? null };
  },
};
