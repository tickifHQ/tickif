import { describe, expect, it, vi } from 'vitest';
import { db, eq, schema, sql } from '@repo/db';
import { makeDesigner } from '@repo/db/testing';
import { portfolioRepository } from '../../../src/modules/profiles/portfolio-repository.js';

describe('profile upload lease fencing', () => {
  it('returns false when purge deletes the profile while logo reservation waits for the lock', async () => {
    const profile = await makeDesigner({ status: 'active' });
    let releasePurge!: () => void;
    let signalLocked!: () => void;
    const purgeReleased = new Promise<void>((resolve) => {
      releasePurge = resolve;
    });
    const purgeLocked = new Promise<void>((resolve) => {
      signalLocked = resolve;
    });
    const purge = db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`organization-retention:${profile.orgId}`}, 0))`,
      );
      signalLocked();
      await purgeReleased;
      await tx.delete(schema.organization).where(eq(schema.organization.id, profile.orgId));
    });
    await purgeLocked;

    const resourceKey = `originals/logos/${profile.id}/late-upload`;
    const reservation = portfolioRepository.reserveLogoUpload(
      profile.id,
      resourceKey,
      new Date('2026-09-05T00:00:00.000Z'),
    );
    await vi.waitFor(async () => {
      const result = await db.execute<{ waiting: boolean }>(sql`
        select exists (
          select 1 from pg_locks where locktype = 'advisory' and granted = false
        ) as waiting
      `);
      expect(result.rows[0]?.waiting).toBe(true);
    });

    releasePurge();
    await purge;
    await expect(reservation).resolves.toBe(false);
    const [lease] = await db
      .select({ resourceKey: schema.organizationUploadLease.resourceKey })
      .from(schema.organizationUploadLease)
      .where(eq(schema.organizationUploadLease.resourceKey, resourceKey));
    expect(lease).toBeUndefined();
  });
});
