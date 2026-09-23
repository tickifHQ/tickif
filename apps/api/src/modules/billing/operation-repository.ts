import { and, eq, inArray } from 'drizzle-orm';
import { db, schema } from '@repo/db';

type Operation = typeof schema.billingOperation.$inferInsert;
export function operationQueries(connection: Pick<typeof db, 'select' | 'insert' | 'update'>) {
  return {
    async findOperation(organizationId: string, operationId: string) {
      const [row] = await connection
        .select()
        .from(schema.billingOperation)
        .where(
          and(
            eq(schema.billingOperation.organizationId, organizationId),
            eq(schema.billingOperation.operationId, operationId),
          ),
        )
        .limit(1);
      return row;
    },
    async findOpenOperation(organizationId: string) {
      const [row] = await connection
        .select()
        .from(schema.billingOperation)
        .where(
          and(
            eq(schema.billingOperation.organizationId, organizationId),
            inArray(schema.billingOperation.status, [
              'requested',
              'processing',
              'reconciliation_pending',
            ]),
          ),
        )
        .limit(1);
      return row;
    },
    async insertOperation(values: Operation) {
      const [row] = await connection.insert(schema.billingOperation).values(values).returning();
      return row!;
    },
    async updateOperation(
      organizationId: string,
      operationId: string,
      changes: Pick<Operation, 'status' | 'result'>,
    ) {
      const [row] = await connection
        .update(schema.billingOperation)
        .set({ ...changes, updatedAt: new Date() })
        .where(
          and(
            eq(schema.billingOperation.organizationId, organizationId),
            eq(schema.billingOperation.operationId, operationId),
          ),
        )
        .returning();
      return row;
    },
  };
}
export const operationRepository = operationQueries(db);
