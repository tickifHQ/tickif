import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@repo/config', () => ({
  config: { RAZORPAY_KEY_ID: 'test_key', RAZORPAY_KEY_SECRET: 'test_secret' },
}));
const { fetchRecoverySubscription } =
  await import('../../src/billing-lifecycle/recovery-provider.js');

describe('recovery provider reads', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('validates the subscription response and performs only a GET', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            id: 'sub_1',
            entity: 'subscription',
            plan_id: 'plan_1',
            status: 'cancelled',
            current_start: null,
            current_end: null,
            short_url: null,
            created_at: 1,
          }),
        ),
      );
    vi.stubGlobal('fetch', fetcher);
    expect((await fetchRecoverySubscription('sub_1')).status).toBe('cancelled');
    expect(fetcher).toHaveBeenCalledWith(
      'https://api.razorpay.com/v1/subscriptions/sub_1',
      expect.not.objectContaining({ method: 'POST' }),
    );
  });

  it('does not interpret a 404 as safe to purchase', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 404 })));
    await expect(fetchRecoverySubscription('missing')).rejects.toThrow('lookup failed (404)');
  });

  it('rejects provider responses for a different subscription', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({
              id: 'sub_other',
              entity: 'subscription',
              plan_id: 'plan_1',
              status: 'cancelled',
              current_start: null,
              current_end: null,
              short_url: null,
              created_at: 1,
            }),
          ),
        ),
    );
    await expect(fetchRecoverySubscription('sub_1')).rejects.toThrow('identity mismatch');
  });

  it('rejects unvalidated terminal-status fragments', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'sub_1', status: 'cancelled' }))),
    );
    await expect(fetchRecoverySubscription('sub_1')).rejects.toThrow();
  });
});
