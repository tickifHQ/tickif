import {
  bigint,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const searchProjectionEntityKindEnum = pgEnum('search_projection_entity_kind', [
  'project',
  'designer',
]);

export const searchProjectionOperationEnum = pgEnum('search_projection_operation', [
  'index',
  'delete',
]);

/**
 * Transactional handoff from PostgreSQL domain writes to the search projection.
 *
 * entityId is intentionally polymorphic and has no foreign key: delete events
 * must remain replayable after their source project or designer is removed.
 *
 * attempts, nextAttemptAt and lastError hold the worker dispatcher's retry state,
 * so a failing row backs off instead of blocking newer rows.
 */
export const searchProjectionOutbox = pgTable(
  'search_projection_outbox',
  {
    sequence: bigint('sequence', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
    entityKind: searchProjectionEntityKindEnum('entity_kind').notNull(),
    entityId: uuid('entity_id').notNull(),
    operation: searchProjectionOperationEnum('operation').notNull(),
    sourceUpdatedAt: timestamp('source_updated_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    dispatchedAt: timestamp('dispatched_at', { withTimezone: true }),
    attempts: integer('attempts').default(0).notNull(),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).defaultNow().notNull(),
    lastError: text('last_error'),
  },
  (t) => [
    check('search_projection_outbox_attempts_check', sql`${t.attempts} >= 0`),
    index('search_projection_outbox_due_idx')
      .on(t.nextAttemptAt, t.sequence)
      .where(sql`${t.dispatchedAt} IS NULL`),
    index('search_projection_outbox_entity_sequence_idx').on(t.entityKind, t.entityId, t.sequence),
  ],
);
