import {
  SEARCH_PROJECTION_ADVISORY_LOCK_KEY,
  and,
  asc,
  db,
  desc,
  eq,
  inArray,
  isNull,
  lte,
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

/** Undispatched rows whose retry delay has passed, oldest due first. */
export async function listDueSearchProjectionEvents(
  limit: number,
  now: Date,
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
      and(
        isNull(schema.searchProjectionOutbox.dispatchedAt),
        lte(schema.searchProjectionOutbox.nextAttemptAt, now),
      ),
    )
    .orderBy(
      asc(schema.searchProjectionOutbox.nextAttemptAt),
      asc(schema.searchProjectionOutbox.sequence),
    )
    .limit(Math.max(1, Math.min(Math.floor(limit), 500)));
}

/**
 * Count an enqueue and push the row's next attempt out by baseSeconds * 2^attempts,
 * capped at maxSeconds. A job that succeeds first marks the row dispatched.
 */
export async function markSearchProjectionEventsEnqueued(
  sequences: bigint[],
  now: Date,
  backoff: { baseSeconds: number; maxSeconds: number },
): Promise<void> {
  if (sequences.length === 0) return;
  await db
    .update(schema.searchProjectionOutbox)
    .set({
      attempts: sql`${schema.searchProjectionOutbox.attempts} + 1`,
      nextAttemptAt: sql`${now.toISOString()}::timestamptz + make_interval(secs => least(
        ${backoff.baseSeconds} * power(2, least(${schema.searchProjectionOutbox.attempts}, 30)),
        ${backoff.maxSeconds}
      ))`,
    })
    .where(
      and(
        inArray(schema.searchProjectionOutbox.sequence, sequences),
        isNull(schema.searchProjectionOutbox.dispatchedAt),
      ),
    );
}

export async function markSearchProjectionEventDispatched(sequence: bigint): Promise<void> {
  await db
    .update(schema.searchProjectionOutbox)
    .set({ dispatchedAt: new Date() })
    .where(eq(schema.searchProjectionOutbox.sequence, sequence));
}

export async function recordSearchProjectionEventError(
  sequence: bigint,
  message: string,
): Promise<void> {
  await db
    .update(schema.searchProjectionOutbox)
    .set({ lastError: message.slice(0, 500) })
    .where(eq(schema.searchProjectionOutbox.sequence, sequence));
}

/** A rebuild projected every row through its watermark, including rows still backing off. */
export async function markSearchProjectionEventsDispatchedThrough(sequence: bigint): Promise<void> {
  await db
    .update(schema.searchProjectionOutbox)
    .set({ dispatchedAt: new Date() })
    .where(
      and(
        isNull(schema.searchProjectionOutbox.dispatchedAt),
        lte(schema.searchProjectionOutbox.sequence, sequence),
      ),
    );
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
