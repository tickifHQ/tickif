import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@repo/config', () => ({
  config: {
    RAZORPAY_KEY_ID: 'rzp_test_key',
    RAZORPAY_KEY_SECRET: 'test-secret',
  },
}));

const { cancelRazorpaySubscription } = await import(
  '../../src/organization-retention/razorpay.js'
);

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('Razorpay retention cleanup', () => {
  it('treats an already-cancelled subscription as an idempotent success', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'cancelled' }), { status: 200 }));

    await expect(cancelRazorpaySubscription('sub_done')).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('cancels immediately and requires a confirmed terminal provider status', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'active' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'cancelled' }), { status: 200 }));

    await cancelRazorpaySubscription('sub_active');

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://api.razorpay.com/v1/subscriptions/sub_active/cancel',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ cancel_at_cycle_end: false }),
      }),
    );
  });

  it('fails closed when provider confirmation is ambiguous', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'active' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'active' }), { status: 200 }));

    await expect(cancelRazorpaySubscription('sub_active')).rejects.toThrow(
      'cancellation returned active',
    );
  });
});
