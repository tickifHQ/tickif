import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { ORGANIZATION_RETENTION_STATUS_VALUES } from '@repo/contracts';
import { organization } from './auth.js';
import { profileStatusEnum, projectArchiveReasonEnum, projectStatusEnum } from './domain.js';

export const organizationRetentionStatusEnum = pgEnum(
  'organization_retention_status',
  ORGANIZATION_RETENTION_STATUS_VALUES,
);

export const organizationRetentionEventTypeEnum = pgEnum('organization_retention_event_type', [
  'deletion_requested',
  'deletion_cancelled',
  'archived',
  'restored',
  'hold_placed',
  'hold_released',
  'purge_requested',
  'purge_started',
  'purge_completed',
  'purge_failed',
]);

export const organizationRetentionTriggerEnum = pgEnum('organization_retention_trigger', [
  'owner',
  'superadmin',
  'retention_schedule',
]);

export const organizationPurgeManifestStatusEnum = pgEnum('organization_purge_manifest_status', [
  'pending',
  'processing',
  'completed',
  'failed',
]);

export const organizationPurgeManifestItemStatusEnum = pgEnum(
  'organization_purge_manifest_item_status',
  ['pending', 'deleted', 'failed'],
);

export const organizationPurgeManifestItemKindEnum = pgEnum(
  'organization_purge_manifest_item_kind',
  ['storage_object'],
);

/**
 * App-owned organization lifecycle state. The restrictive FK is the database
 * backstop that prevents bypassing the explicit purge workflow.
 */
export const organizationRetention = pgTable(
  'organization_retention',
  {
    organizationId: text('organization_id')
      .primaryKey()
      .references(() => organization.id, { onDelete: 'restrict' }),
    status: organizationRetentionStatusEnum('status').notNull(),
    requestedByUserId: text('requested_by_user_id').notNull(),
    requestedAt: timestamp('requested_at', { withTimezone: true }).notNull(),
    archiveDueAt: timestamp('archive_due_at', { withTimezone: true }).notNull(),
    hardDeleteDueAt: timestamp('hard_delete_due_at', { withTimezone: true }).notNull(),
    delistWindowDays: integer('delist_window_days').notNull(),
    archiveWindowDays: integer('archive_window_days').notNull(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    purgeRequestedAt: timestamp('purge_requested_at', { withTimezone: true }),
    purgingAt: timestamp('purging_at', { withTimezone: true }),
    erasedAt: timestamp('erased_at', { withTimezone: true }),
    holdPlacedAt: timestamp('hold_placed_at', { withTimezone: true }),
    holdPlacedByUserId: text('hold_placed_by_user_id'),
    holdReason: text('hold_reason'),
    revision: integer('revision').default(1).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('organization_retention_archive_due_idx')
      .on(t.archiveDueAt)
      .where(sql`${t.status} = 'deletion_requested' and ${t.holdPlacedAt} is null`),
    index('organization_retention_hard_delete_due_idx')
      .on(t.hardDeleteDueAt)
      .where(sql`${t.status} = 'archived' and ${t.holdPlacedAt} is null`),
    check(
      'organization_retention_due_order_check',
      sql`${t.requestedAt} <= ${t.archiveDueAt} and ${t.archiveDueAt} <= ${t.hardDeleteDueAt}`,
    ),
    check('organization_retention_revision_check', sql`${t.revision} > 0`),
    check(
      'organization_retention_policy_windows_check',
      sql`${t.delistWindowDays} > 0 and ${t.archiveWindowDays} > 0`,
    ),
    check(
      'organization_retention_hold_check',
      sql`(${t.holdPlacedAt} is null and ${t.holdPlacedByUserId} is null and ${t.holdReason} is null) or (${t.holdPlacedAt} is not null and ${t.holdPlacedByUserId} is not null and ${t.holdReason} is not null and char_length(trim(${t.holdReason})) > 0)`,
    ),
  ],
);

/** Exact project state captured before organization retention mutates visibility. */
export const organizationRetentionProjectSnapshot = pgTable(
  'organization_retention_project_snapshot',
  {
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizationRetention.organizationId, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    originalStatus: projectStatusEnum('original_status').notNull(),
    originalArchiveReason: projectArchiveReasonEnum('original_archive_reason'),
    originalPublishedAt: timestamp('original_published_at'),
    originalFeaturedAt: timestamp('original_featured_at'),
    capturedAt: timestamp('captured_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    primaryKey({
      name: 'organization_retention_project_snapshot_pk',
      columns: [t.organizationId, t.projectId],
    }),
    index('organization_retention_project_snapshot_project_idx').on(t.projectId),
  ],
);

/** Exact designer-profile state captured before removing the organization from discovery. */
export const organizationRetentionProfileSnapshot = pgTable(
  'organization_retention_profile_snapshot',
  {
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizationRetention.organizationId, { onDelete: 'cascade' }),
    profileId: uuid('profile_id').notNull(),
    originalStatus: profileStatusEnum('original_status').notNull(),
    capturedAt: timestamp('captured_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    primaryKey({
      name: 'organization_retention_profile_snapshot_pk',
      columns: [t.organizationId, t.profileId],
    }),
    index('organization_retention_profile_snapshot_profile_idx').on(t.profileId),
  ],
);

/** Append-only audit history. Actor IDs intentionally survive account and organization deletion. */
export const organizationRetentionEvent = pgTable(
  'organization_retention_event',
  {
    sequence: bigint('sequence', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
    organizationId: text('organization_id').notNull(),
    revision: integer('revision').notNull(),
    type: organizationRetentionEventTypeEnum('type').notNull(),
    trigger: organizationRetentionTriggerEnum('trigger').notNull(),
    actorUserId: text('actor_user_id'),
    details: jsonb('details').$type<Record<string, unknown>>().default({}).notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('organization_retention_event_org_revision_idx').on(t.organizationId, t.revision),
    index('organization_retention_event_org_occurred_idx').on(t.organizationId, t.occurredAt),
    check('organization_retention_event_revision_check', sql`${t.revision} > 0`),
  ],
);

/** Durable header for an organization purge, retained after the organization row is gone. */
export const organizationPurgeManifest = pgTable(
  'organization_purge_manifest',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: text('organization_id').notNull(),
    organizationSlug: text('organization_slug').notNull(),
    status: organizationPurgeManifestStatusEnum('status').default('pending').notNull(),
    trigger: organizationRetentionTriggerEnum('trigger').notNull(),
    requestedByUserId: text('requested_by_user_id'),
    attemptCount: integer('attempt_count').default(0).notNull(),
    lastErrorCode: text('last_error_code'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('organization_purge_manifest_org_uniq').on(t.organizationId),
    index('organization_purge_manifest_status_created_idx').on(t.status, t.createdAt),
    check('organization_purge_manifest_attempt_count_check', sql`${t.attemptCount} >= 0`),
  ],
);

/** Retryable external object deletion captured before cascading database deletion. */
export const organizationPurgeManifestItem = pgTable(
  'organization_purge_manifest_item',
  {
    sequence: bigint('sequence', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
    manifestId: uuid('manifest_id')
      .notNull()
      .references(() => organizationPurgeManifest.id, { onDelete: 'cascade' }),
    kind: organizationPurgeManifestItemKindEnum('kind').notNull(),
    resourceKey: text('resource_key').notNull(),
    status: organizationPurgeManifestItemStatusEnum('status').default('pending').notNull(),
    attemptCount: integer('attempt_count').default(0).notNull(),
    lastErrorCode: text('last_error_code'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('organization_purge_manifest_item_resource_uniq').on(
      t.manifestId,
      t.kind,
      t.resourceKey,
    ),
    index('organization_purge_manifest_item_status_sequence_idx').on(t.status, t.sequence),
    index('organization_purge_manifest_item_manifest_idx').on(t.manifestId),
    check('organization_purge_manifest_item_attempt_count_check', sql`${t.attemptCount} >= 0`),
  ],
);

/** Public 410 marker that remains after cascading organization/project deletion. */
export const projectTombstone = pgTable(
  'project_tombstone',
  {
    projectId: uuid('project_id').primaryKey(),
    projectSlug: text('project_slug').notNull(),
    organizationId: text('organization_id').notNull(),
    purgedAt: timestamp('purged_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('project_tombstone_slug_uniq').on(t.projectSlug),
    index('project_tombstone_organization_idx').on(t.organizationId),
  ],
);
