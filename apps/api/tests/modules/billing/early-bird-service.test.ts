import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  claim: vi.fn(),
  status: vi.fn(),
  expire: vi.fn(),
  invalidate: vi.fn(),
}));
vi.mock('../../../src/modules/billing/selection-service.js', () => ({
  assertBillingAccess: mocks.access,
}));
vi.mock('@repo/billing', () => ({
  claimEarlyBird: mocks.claim,
  earlyBirdStatus: mocks.status,
  expireEarlyBird: mocks.expire,
}));
vi.mock('../../../src/lib/redis.js', () => ({ invalidateEntitlementCache: mocks.invalidate }));
import { earlyBirdService } from '../../../src/modules/billing/early-bird-service.js';
const caller = { userId: 'owner', activeOrgId: 'org' };
beforeEach(() => vi.resetAllMocks());

describe('early-bird service', () => {
  it('checks live billing authorization before reading or granting a trial', async () => {
    mocks.access.mockRejectedValue(new Error('Forbidden'));
    await expect(earlyBirdService.claim(caller, 'corporate')).rejects.toThrow('Forbidden');
    await expect(earlyBirdService.status(caller)).rejects.toThrow('Forbidden');
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(mocks.status).not.toHaveBeenCalled();
  });
  it('returns a conflict when the atomic claim is ineligible', async () => {
    mocks.claim.mockResolvedValue(null);
    await expect(earlyBirdService.claim(caller, 'corporate')).rejects.toMatchObject({
      status: 409,
    });
    expect(mocks.invalidate).not.toHaveBeenCalled();
  });
  it('invalidates entitlements after activation and lazy expiry', async () => {
    const trial = {
      tier: 'corporate',
      startedAt: '2026-10-01T00:00:00.000Z',
      endsAt: '2027-01-01T00:00:00.000Z',
    };
    mocks.claim.mockResolvedValue(trial);
    expect(await earlyBirdService.claim(caller, 'corporate')).toEqual({ eligible: false, trial });
    expect(mocks.invalidate).toHaveBeenCalledWith('org');
    mocks.expire.mockResolvedValue(true);
    mocks.status.mockResolvedValue({ eligible: false, trial: null });
    expect(await earlyBirdService.status(caller)).toEqual({ eligible: false, trial: null });
    expect(mocks.invalidate).toHaveBeenCalledTimes(2);
  });
});
