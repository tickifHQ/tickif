import { describe, expect, it } from 'vitest';
import { db, eq, schema } from '@repo/db';
import { makeDesigner } from '@repo/db/testing';
import { subscribeRepository } from '../../../src/modules/billing/subscribe-repository.js';

describe('subscription search projection', () => {
  it('records renewed coverage and ranking refresh in the same transaction', async () => {
    const designer = await makeDesigner();
    const [subscription] = await db
      .insert(schema.subscription)
      .values({
        organizationId: designer.orgId,
        planTier: 'professional_plus',
        subscriptionState: 'active',
      })
      .returning();
    const until = new Date('2030-01-01T00:00:00Z');
    await subscribeRepository.update(subscription!.id, { currentPeriodEnd: until });
    const events = await db
      .select()
      .from(schema.searchProjectionOutbox)
      .where(eq(schema.searchProjectionOutbox.entityId, designer.id));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ entityKind: 'designer', operation: 'index' });
    expect((await subscribeRepository.find(designer.orgId))?.currentPeriodEnd).toEqual(until);

    await expect(
      subscribeRepository.withOrganizationLock(designer.orgId, async (repository) => {
        await repository.update(subscription!.id, {
          currentPeriodEnd: new Date('2031-01-01T00:00:00Z'),
        });
        throw new Error('rollback fixture');
      }),
    ).rejects.toThrow('rollback fixture');
    expect((await subscribeRepository.find(designer.orgId))?.currentPeriodEnd).toEqual(until);
    expect(
      await db
        .select()
        .from(schema.searchProjectionOutbox)
        .where(eq(schema.searchProjectionOutbox.entityId, designer.id)),
    ).toHaveLength(1);
  });
});
