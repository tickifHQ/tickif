import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import {
  organizationPurgeManifest,
  organizationPurgeManifestItem,
  organizationPurgeManifestItemKindEnum,
  organizationRetention,
  organizationRetentionEvent,
  organizationRetentionProfileSnapshot,
  organizationRetentionProjectSnapshot,
  organizationRetentionStatusEnum,
  projectTombstone,
} from '../src/schema/index.js';

describe('organization retention schema', () => {
  it('defines the complete forward-only lifecycle', () => {
    expect(organizationRetentionStatusEnum.enumValues).toEqual([
      'deletion_requested',
      'archived',
      'purge_pending',
      'purging',
      'erased',
    ]);
  });

  it('stores config-derived deadlines, legal hold data, and a revision', () => {
    const config = getTableConfig(organizationRetention);
    const names = config.columns.map((column) => column.name);

    expect(names).toEqual(
      expect.arrayContaining([
        'archive_due_at',
        'hard_delete_due_at',
        'hold_placed_at',
        'hold_placed_by_user_id',
        'hold_reason',
        'revision',
      ]),
    );
    expect(names).toEqual(expect.arrayContaining(['delist_window_days', 'archive_window_days']));
    expect(config.foreignKeys).toHaveLength(1);
  });

  it('captures exact project and profile states without cascading entity foreign keys', () => {
    const projectConfig = getTableConfig(organizationRetentionProjectSnapshot);
    const profileConfig = getTableConfig(organizationRetentionProfileSnapshot);

    expect(projectConfig.columns.map((column) => column.name)).toEqual(
      expect.arrayContaining([
        'project_id',
        'original_status',
        'original_archive_reason',
        'original_published_at',
        'original_featured_at',
      ]),
    );
    expect(profileConfig.columns.map((column) => column.name)).toEqual(
      expect.arrayContaining(['profile_id', 'original_status']),
    );
    expect(projectConfig.foreignKeys).toHaveLength(1);
    expect(profileConfig.foreignKeys).toHaveLength(1);
  });

  it('keeps audit events, purge manifests, and tombstones after source deletion', () => {
    expect(getTableConfig(organizationRetentionEvent).foreignKeys).toHaveLength(0);
    expect(getTableConfig(organizationPurgeManifest).foreignKeys).toHaveLength(0);
    expect(getTableConfig(projectTombstone).foreignKeys).toHaveLength(0);
  });

  it('indexes the manifest item foreign key and retry claim path', () => {
    const config = getTableConfig(organizationPurgeManifestItem);

    expect(config.foreignKeys).toHaveLength(1);
    expect(config.indexes.map((tableIndex) => tableIndex.config.name)).toEqual(
      expect.arrayContaining([
        'organization_purge_manifest_item_status_sequence_idx',
        'organization_purge_manifest_item_manifest_idx',
      ]),
    );
  });

  it('keeps provider cancellation in the same durable retry manifest', () => {
    expect(organizationPurgeManifestItemKindEnum.enumValues).toEqual([
      'storage_object',
      'razorpay_subscription',
    ]);
  });
});
