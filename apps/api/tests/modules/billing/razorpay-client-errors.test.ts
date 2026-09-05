import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@repo/config', () => ({
  config: {
    RAZORPAY_KEY_ID: 'rzp_test_fixture',
    RAZORPAY_KEY_SECRET: 'billing-test-secret',
  },
}));

const { fetchSubscription } = await import('../../../src/modules/billing/razorpay-client.js');

describe('billing / razorpay-client failures', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('maps transport failures to an upstream error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new DOMException('timed out', 'TimeoutError')),
    );

    await expect(fetchSubscription('sub_transport')).rejects.toMatchObject({
      code: 'upstream_error',
      status: 502,
      message: 'Razorpay fetchSubscription failed: provider unavailable',
    });
  });

  it('maps a non-JSON provider failure to an upstream error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('<html>gateway unavailable</html>', {
          status: 503,
          statusText: 'Service Unavailable',
        }),
      ),
    );

    await expect(fetchSubscription('sub_bad_response')).rejects.toMatchObject({
      code: 'upstream_error',
      status: 502,
      message: 'Razorpay fetchSubscription failed: invalid provider response',
    });
  });

  it('preserves a structured Razorpay error without exposing credentials', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        Response.json(
          { error: { code: 'BAD_REQUEST_ERROR', description: 'Subscription cannot be fetched' } },
          { status: 400, statusText: 'Bad Request' },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchSubscription('sub/with spaces')).rejects.toMatchObject({
      code: 'upstream_error',
      status: 502,
      message: 'Razorpay fetchSubscription failed: Subscription cannot be fetched',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.razorpay.com/v1/subscriptions/sub%2Fwith%20spaces',
      expect.objectContaining({ method: 'GET' }),
    );
  });
});
