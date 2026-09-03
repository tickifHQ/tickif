import { ACCOUNT_STATUS, PLATFORM_ROLE, type UpsertVisitorProfileInput } from '@repo/contracts';
import { and, db, eq, schema } from '@repo/db';
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
    input: UpsertVisitorProfileInput,
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
          (account?.role === PLATFORM_ROLE.VISITOR || account?.role === PLATFORM_ROLE.DESIGNER) &&
          (account.status === ACCOUNT_STATUS.PENDING || account.status === ACCOUNT_STATUS.ACTIVE) &&
          !isBanned;
        if (!canWrite) throw new VisitorProfileAccessDeniedError();

        const [profile] = await tx
          .insert(schema.visitorProfile)
          .values({
            userId,
            address: input.address,
            whatsappNumber: input.whatsappNumber,
            onboardingCompletedAt: now,
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: schema.visitorProfile.userId,
            set: {
              address: input.address,
              whatsappNumber: input.whatsappNumber,
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
      if (databaseErrorCode(error) === '23514') throw new VisitorProfileConstraintError();
      throw error;
    }
  },
};
