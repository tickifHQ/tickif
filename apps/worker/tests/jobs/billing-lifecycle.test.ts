import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const repository = vi.hoisted(() => ({
  findGraceExpired: vi.fn(),
  findLockedExpired: vi.fn(),
  transitionGraceToLocked: vi.fn(),
  transitionLockedToDowngraded: vi.fn(),
}));
const cache = vi.hoisted(() => ({ invalidateEntitlementCache: vi.fn() }));
const sharedDb = vi.hoisted(() => ({ sweepOrgExpirations: vi.fn() }));
const retention = vi.hoisted(() => ({ processOrganizationRetentionSweep: vi.fn() }));

vi.mock('@repo/config', () => ({
  config: {
    BILLING_GRACE_PERIOD_DAYS: 7,
    BILLING_LOCKED_PERIOD_DAYS: 30,
  },
}));
vi.mock('@repo/db', () => ({ sweepOrgExpirations: sharedDb.sweepOrgExpirations }));
vi.mock('../../src/billing-lifecycle/repository.js', () => repository);
vi.mock('../../src/billing-lifecycle/cache.js', () => cache);
vi.mock('../../src/jobs/organization-retention.js', () => retention);

const { processBillingLifecycleSweep } = await import('../../src/jobs/billing-lifecycle.js');

describe('processBillingLifecycleSweep failure reporting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('counts isolated failures while continuing to process the rest of the batch', async () => {
    repository.findGraceExpired.mockResolvedValue([
      { id: 'grace-failure', organizationId: 'org-grace-failure' },
      { id: 'grace-success', organizationId: 'org-grace-success' },
    ]);
    repository.transitionGraceToLocked
      .mockRejectedValueOnce(new Error('grace transition failed'))
      .mockResolvedValueOnce(true);
    repository.findLockedExpired.mockResolvedValue([
      { id: 'downgrade-failure', organizationId: 'org-downgrade-failure' },
      { id: 'downgrade-success', organizationId: 'org-downgrade-success' },
    ]);
    repository.transitionLockedToDowngraded
      .mockRejectedValueOnce(new Error('downgrade transition failed'))
      .mockResolvedValueOnce(true);
    cache.invalidateEntitlementCache.mockResolvedValue(undefined);
    sharedDb.sweepOrgExpirations.mockRejectedValue(new Error('org expiry failed'));
    retention.processOrganizationRetentionSweep.mockRejectedValue(
      new Error('organization retention failed'),
    );

    await expect(
      processBillingLifecycleSweep(new Date('2026-09-04T00:00:00.000Z')),
    ).resolves.toEqual({
      lockedFromGrace: 1,
      downgradedFromLocked: 1,
      invitationsExpired: 0,
      transfersExpired: 0,
      graceFailures: 1,
      downgradeFailures: 1,
      orgExpiryFailures: 1,
      organizationsArchived: 0,
      organizationsPurged: 0,
      organizationRetentionFailures: 1,
    });
    expect(repository.transitionGraceToLocked).toHaveBeenCalledTimes(2);
    expect(repository.transitionLockedToDowngraded).toHaveBeenCalledTimes(2);
    expect(cache.invalidateEntitlementCache).toHaveBeenCalledWith('org-grace-success');
    expect(cache.invalidateEntitlementCache).toHaveBeenCalledWith('org-downgrade-success');
    expect(retention.processOrganizationRetentionSweep).toHaveBeenCalledOnce();
  });
});
