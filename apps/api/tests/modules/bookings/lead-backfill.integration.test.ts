import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { db, sql } from '@repo/db';
import { assertTestDb } from '@repo/db/testing';

const migration = readFileSync(
  new URL('../../../../../packages/db/migrations/0073_breezy_fantastic_four.sql', import.meta.url),
  'utf8',
);
const backfill = migration.split('--> statement-breakpoint')[2];

describe('legacy consultation lead backfill', () => {
  it('does not assign a later lead to an older booking after the requester changes phone', async () => {
    await assertTestDb();
    expect(backfill).toBeDefined();
    await db.transaction(async (tx) => {
      // Temporary tables reproduce historical rows without changing the shared test schema.
      await tx.execute(sql`
        CREATE TEMP TABLE "user" (id text, phone_number text) ON COMMIT DROP;
        CREATE TEMP TABLE designer_profile (id text, team_id text) ON COMMIT DROP;
        CREATE TEMP TABLE consultation_booking (
          id text, organization_id text, designer_profile_id text, requester_id text,
          referred_project_id text, requested_at timestamptz, lead_id text
        ) ON COMMIT DROP;
        CREATE TEMP TABLE lead (
          id text, organization_id text, team_id text, referred_project_id text,
          contact_number text, received_at timestamptz, source text
        ) ON COMMIT DROP;
        INSERT INTO "user" VALUES ('requester', '+919800000002');
        INSERT INTO designer_profile VALUES ('profile', 'team');
        INSERT INTO consultation_booking VALUES
          ('old-booking', 'org', 'profile', 'requester', NULL, '2026-01-01T10:00:00Z', NULL),
          ('new-booking', 'org', 'profile', 'requester', NULL, '2026-02-01T10:00:00Z', NULL);
        INSERT INTO lead VALUES
          ('old-lead', 'org', 'team', NULL, '+919800000001', '2026-01-01T10:00:00Z', 'consultation'),
          ('new-lead', 'org', 'team', NULL, '+919800000002', '2026-02-01T10:00:00Z', 'consultation');
      `);
      await tx.execute(sql.raw(backfill!));
      const result = await tx.execute(sql`
        SELECT id, lead_id FROM consultation_booking ORDER BY id
      `);
      expect(result.rows).toEqual([
        { id: 'new-booking', lead_id: 'new-lead' },
        { id: 'old-booking', lead_id: null },
      ]);
    });
  });
});
