import { and, eq, inArray } from 'drizzle-orm';
import { db, schema } from '@repo/db';

type RecoveryInsert = typeof schema.billingRecovery.$inferInsert;
export type RecoveryRow = typeof schema.billingRecovery.$inferSelect;
export function recoveryQueries(connection: Pick<typeof db, 'select' | 'insert' | 'update'>) {
  return {
    async findRecovery(organizationId: string) {
      const [row] = await connection
        .select()
        .from(schema.billingRecovery)
        .where(
          and(
            eq(schema.billingRecovery.organizationId, organizationId),
            inArray(schema.billingRecovery.status, [
              'requested',
              'waiting_for_expiry',
              'eligible',
              'checkout_pending',
            ]),
          ),
        )
        .limit(1);
      return row;
    },
    async insertRecovery(values: RecoveryInsert) {
      const [row] = await connection.insert(schema.billingRecovery).values(values).returning();
      return row!;
    },
    async updateRecovery(
      organizationId: string,
      id: string,
      expectedRevision: number,
      changes: Partial<
        Pick<RecoveryInsert, 'targetTier' | 'status' | 'eligibleAt' | 'reason' | 'actorId'>
      >,
    ) {
      const [row] = await connection
        .update(schema.billingRecovery)
        .set({ ...changes, revision: expectedRevision + 1, updatedAt: new Date() })
        .where(
          and(
            eq(schema.billingRecovery.organizationId, organizationId),
            eq(schema.billingRecovery.id, id),
            eq(schema.billingRecovery.revision, expectedRevision),
          ),
        )
        .returning();
      return row;
    },
  };
}
export const recoveryRepository = recoveryQueries(db);
