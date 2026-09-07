import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { db, sql } from '@repo/db';

describe('moderation reason migration', () => {
  it('maps legacy reasons without changing the original audit fields', async () => {
    const migration = readFileSync(
      new URL('../../../../packages/db/migrations/0062_secret_annihilus.sql', import.meta.url),
      'utf8',
    );
    await db.transaction(async (tx) => {
      // Transaction-local tables shadow the real tables and are removed on commit.
      await tx.execute(sql`CREATE TEMP TABLE project (
        id text, status text, rejection_reason_code text, moderation_note text,
        rejection_reason_codes project_moderation_reason[] NOT NULL DEFAULT '{}'
      ) ON COMMIT DROP`);
      await tx.execute(sql`CREATE TEMP TABLE project_moderation_event (
        id text, action text, reason_code text, note text,
        reason_codes project_moderation_reason[] NOT NULL DEFAULT '{}'
      ) ON COMMIT DROP`);
      await tx.execute(sql`INSERT INTO project (id, status, rejection_reason_code, moderation_note) VALUES
        ('known', 'rejected', 'image-quality', 'Sharper photos'),
        ('unknown', 'rejected', 'legacy custom code', 'Original note'),
        ('note-only', 'changes_requested', NULL, 'Add details'),
        ('published', 'published', NULL, NULL)`);
      await tx.execute(sql`INSERT INTO project_moderation_event (id, action, reason_code, note) VALUES
        ('known', 'reject', 'image-quality', 'Sharper photos'),
        ('unknown', 'reject', 'legacy custom code', 'Original note'),
        ('note-only', 'request_changes', NULL, 'Add details'),
        ('published', 'publish', NULL, NULL)`);
      const updates = migration
        .split('--> statement-breakpoint')
        .filter((statement) => statement.includes('UPDATE "'));
      expect(updates).toHaveLength(2);
      for (const statement of updates) await tx.execute(sql.raw(statement));
      const projects = await tx.execute(
        sql`SELECT id, rejection_reason_code AS original, to_json(rejection_reason_codes) AS codes, moderation_note AS note FROM project ORDER BY id`,
      );
      const events = await tx.execute(
        sql`SELECT id, reason_code AS original, to_json(reason_codes) AS codes, note FROM project_moderation_event ORDER BY id`,
      );
      const expected = [
        {
          id: 'known',
          original: 'image-quality',
          codes: ['image-quality'],
          note: 'Sharper photos',
        },
        { id: 'note-only', original: null, codes: ['other'], note: 'Add details' },
        { id: 'published', original: null, codes: [], note: null },
        { id: 'unknown', original: 'legacy custom code', codes: ['other'], note: 'Original note' },
      ];
      expect(projects.rows).toEqual(expected);
      expect(events.rows).toEqual(expected);
    });
  });
});
