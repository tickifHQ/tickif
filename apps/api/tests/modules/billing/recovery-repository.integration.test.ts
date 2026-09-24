import { describe, expect, it } from 'vitest';
import { db, schema } from '@repo/db';
import { makeOrganization } from '@repo/db/testing';
import { recoveryRepository } from '../../../src/modules/billing/recovery-repository.js';

describe('durable recovery database invariants', () => {
  it('permits one open intent per organization and retains terminal history', async () => {
    const org = await makeOrganization();
    const row = await recoveryRepository.insertRecovery({
      organizationId: org.id,
      targetTier: 'corporate',
      sourceSubscriptionId: 'sub_source',
    });
    await expect(
      recoveryRepository.insertRecovery({
        organizationId: org.id,
        targetTier: 'professional_plus',
        sourceSubscriptionId: 'sub_source',
      }),
    ).rejects.toThrow();
    await recoveryRepository.updateRecovery(org.id, row.id, row.revision, { status: 'dismissed' });
    const next = await recoveryRepository.insertRecovery({
      organizationId: org.id,
      targetTier: 'professional_plus',
      sourceSubscriptionId: 'sub_source',
    });
    expect((await recoveryRepository.findRecovery(org.id))?.id).toBe(next.id);
    expect(await db.select().from(schema.billingRecovery)).toHaveLength(2);
  });
  it('rejects stale and cross-organization edits', async () => {
    const org = await makeOrganization();
    const other = await makeOrganization();
    const row = await recoveryRepository.insertRecovery({
      organizationId: org.id,
      targetTier: 'corporate',
      sourceSubscriptionId: 'sub_source',
    });
    expect(
      await recoveryRepository.updateRecovery(other.id, row.id, 1, { status: 'dismissed' }),
    ).toBeUndefined();
    expect(
      await recoveryRepository.updateRecovery(org.id, row.id, 1, {
        targetTier: 'professional_plus',
      }),
    ).toMatchObject({ revision: 2 });
    expect(
      await recoveryRepository.updateRecovery(org.id, row.id, 1, { status: 'dismissed' }),
    ).toBeUndefined();
    expect(await recoveryRepository.findRecovery(org.id)).toMatchObject({
      targetTier: 'professional_plus',
      revision: 2,
    });
  });
});
