import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import {
  searchProjectionEntityKindEnum,
  searchProjectionOperationEnum,
  searchProjectionOutbox,
} from '../src/schema/search.js';

describe('search projection outbox schema', () => {
  const config = getTableConfig(searchProjectionOutbox);

  it('uses closed entity and operation domains', () => {
    expect(searchProjectionEntityKindEnum.enumValues).toEqual(['project', 'designer']);
    expect(searchProjectionOperationEnum.enumValues).toEqual(['index', 'delete']);
  });

  it('uses a monotonic bigint identity as the replay watermark', () => {
    const sequence = config.columns.find((column) => column.name === 'sequence');

    expect(sequence).toMatchObject({
      columnType: 'PgBigInt64',
      primary: true,
      notNull: true,
    });
    expect(sequence?.generatedIdentity).toMatchObject({ type: 'always' });
  });

  it('keeps polymorphic entity references replayable after source deletion', () => {
    expect(config.foreignKeys).toHaveLength(0);
  });

  it('uses timezone-aware source and delivery timestamps', () => {
    const timestamps = config.columns.filter((column) =>
      ['source_updated_at', 'created_at', 'dispatched_at'].includes(column.name),
    );

    expect(timestamps).toHaveLength(3);
    expect(timestamps.every((column) => column.columnType === 'PgTimestamp')).toBe(true);
    expect(timestamps.every((column) => 'withTimezone' in column && column.withTimezone)).toBe(
      true,
    );
  });

  it('supports ordered undispatched claiming and entity replay', () => {
    expect(config.indexes.map((tableIndex) => tableIndex.config.name)).toEqual([
      'search_projection_outbox_undispatched_sequence_idx',
      'search_projection_outbox_entity_sequence_idx',
    ]);

    const [undispatched, entityReplay] = config.indexes;
    expect(undispatched?.config.columns).toHaveLength(1);
    expect(undispatched?.config.where).toBeDefined();
    expect(entityReplay?.config.columns).toHaveLength(3);
  });
});
