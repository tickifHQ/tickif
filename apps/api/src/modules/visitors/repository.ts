import { ACCOUNT_STATUS, type UpsertVisitorProfileInput } from '@repo/contracts';
import { and, db, eq, schema } from '@repo/db';

export type VisitorProfileRecord = typeof schema.visitorProfile.$inferSelect;

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
    return db.transaction(async (tx) => {
      const now = new Date();
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

      await tx
        .update(schema.user)
        .set({ status: ACCOUNT_STATUS.ACTIVE, updatedAt: now })
        .where(and(eq(schema.user.id, userId), eq(schema.user.status, ACCOUNT_STATUS.PENDING)));

      return profile;
    });
  },
};
