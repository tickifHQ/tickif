import {
  SEARCH_PROJECTION_ADVISORY_LOCK_KEY,
  asc,
  db,
  desc,
  eq,
  isNull,
  schema,
  sql,
} from '@repo/db';

export type SearchProjectionOutboxRecord = {
  sequence: bigint;
  entityKind: 'project' | 'designer';
  entityId: string;
  operation: 'index' | 'delete';
  sourceUpdatedAt: Date;
};

export async function listPendingSearchProjectionEvents(
  limit: number,
): Promise<SearchProjectionOutboxRecord[]> {
  return db
    .select({
      sequence: schema.searchProjectionOutbox.sequence,
      entityKind: schema.searchProjectionOutbox.entityKind,
      entityId: schema.searchProjectionOutbox.entityId,
      operation: schema.searchProjectionOutbox.operation,
      sourceUpdatedAt: schema.searchProjectionOutbox.sourceUpdatedAt,
    })
    .from(schema.searchProjectionOutbox)
    .where(isNull(schema.searchProjectionOutbox.dispatchedAt))
    .orderBy(asc(schema.searchProjectionOutbox.sequence))
    .limit(Math.max(1, Math.min(Math.floor(limit), 500)));
}

export async function markSearchProjectionEventDispatched(sequence: bigint): Promise<void> {
  await db
    .update(schema.searchProjectionOutbox)
    .set({ dispatchedAt: new Date() })
    .where(eq(schema.searchProjectionOutbox.sequence, sequence));
}

export async function withSearchProjectionRebuildBarrier<T>(work: () => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${SEARCH_PROJECTION_ADVISORY_LOCK_KEY})`);
    return work();
  });
}

export async function withSearchProjectionEntityLock<T>(
  entityKind: 'project' | 'designer',
  entityId: string,
  work: () => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock_shared(${SEARCH_PROJECTION_ADVISORY_LOCK_KEY})`,
    );
    await tx.execute(
      sql`select pg_advisory_xact_lock(${SEARCH_PROJECTION_ADVISORY_LOCK_KEY}, hashtext(${`${entityKind}:${entityId}`}))`,
    );
    return work();
  });
}

export async function latestSearchProjectionSequence(): Promise<bigint> {
  const [row] = await db
    .select({ sequence: schema.searchProjectionOutbox.sequence })
    .from(schema.searchProjectionOutbox)
    .orderBy(desc(schema.searchProjectionOutbox.sequence))
    .limit(1);
  return row?.sequence ?? 0n;
}

export async function listSearchProjectionEventsBetween(
  afterSequence: bigint,
  throughSequence: bigint,
  limit: number,
): Promise<SearchProjectionOutboxRecord[]> {
  return db
    .select({
      sequence: schema.searchProjectionOutbox.sequence,
      entityKind: schema.searchProjectionOutbox.entityKind,
      entityId: schema.searchProjectionOutbox.entityId,
      operation: schema.searchProjectionOutbox.operation,
      sourceUpdatedAt: schema.searchProjectionOutbox.sourceUpdatedAt,
    })
    .from(schema.searchProjectionOutbox)
    .where(
      sql`${schema.searchProjectionOutbox.sequence} > ${afterSequence}
        and ${schema.searchProjectionOutbox.sequence} <= ${throughSequence}`,
    )
    .orderBy(asc(schema.searchProjectionOutbox.sequence))
    .limit(Math.max(1, Math.min(Math.floor(limit), 500)));
}
