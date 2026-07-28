import { SEARCH_PROJECTION_ADVISORY_LOCK_KEY, schema, sql, type DB } from '@repo/db';

export type SearchProjectionEvent = {
  entityKind: 'project' | 'designer';
  entityId: string;
  operation: 'index' | 'delete';
  sourceUpdatedAt: Date;
};

type Transaction = Parameters<Parameters<DB['transaction']>[0]>[0];

/**
 * Record projection work in the same transaction as its source mutation.
 * The shared advisory lock participates in the full-rebuild snapshot barrier.
 */
export async function recordSearchProjectionEvents(
  tx: Transaction,
  events: SearchProjectionEvent[],
): Promise<void> {
  if (events.length === 0) return;
  await tx.execute(
    sql`select pg_advisory_xact_lock_shared(${SEARCH_PROJECTION_ADVISORY_LOCK_KEY})`,
  );
  await tx.insert(schema.searchProjectionOutbox).values(events);
}
