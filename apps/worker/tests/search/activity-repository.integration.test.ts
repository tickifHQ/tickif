import { describe, expect, it } from 'vitest';
import { db, asc, eq, schema } from '@repo/db';
import { makeUser } from '@repo/db/testing';
import { purgeExpiredSearchActivity } from '../../src/search/activity-repository.js';

describe('search activity retention', () => {
  it('purges expired searches for inactive users and keeps recent history', async () => {
    const now = new Date('2026-09-22T12:00:00.000Z');
    const user = await makeUser({ phoneNumber: '+919800002399' });
    await db.insert(schema.searchActivity).values([
      {
        actorUserId: user.id,
        endpoint: 'projects',
        query: 'expired search',
        createdAt: new Date('2026-03-01T00:00:00.000Z'),
      },
      {
        actorUserId: user.id,
        endpoint: 'designers',
        query: 'recent search',
        createdAt: new Date('2026-09-01T00:00:00.000Z'),
      },
    ]);

    await expect(purgeExpiredSearchActivity(now)).resolves.toBe(1);
    await expect(
      db
        .select({ query: schema.searchActivity.query })
        .from(schema.searchActivity)
        .where(eq(schema.searchActivity.actorUserId, user.id))
        .orderBy(asc(schema.searchActivity.createdAt)),
    ).resolves.toEqual([{ query: 'recent search' }]);
  });
});
