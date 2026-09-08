import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@repo/config', () => ({
  config: {
    RAZORPAY_KEY_ID: 'rzp_test_fixture',
    RAZORPAY_KEY_SECRET: 'billing-test-secret',
  },
}));

const { fetchSubscription, updateSubscription, isDomesticCardPlanChangeRejection } = await import(
  '../../../src/modules/billing/razorpay-client.js'
);

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

  // ── E-289: domestic-card plan-change classification ────────────────────────

  it('classifies the domestic-card plan-change rejection as 422 payment_mode_change_unsupported', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json(
          {
            error: {
              code: 'BAD_REQUEST_ERROR',
              description:
                'Only offers can be updated for subscriptions when payment mode is domestic card.',
            },
          },
          { status: 400, statusText: 'Bad Request' },
        ),
      ),
    );

    await expect(
      updateSubscription({ subscriptionId: 'sub_domestic', planId: 'plan_corporate' }),
    ).rejects.toMatchObject({
      code: 'payment_mode_change_unsupported',
      status: 422,
    });
  });

  it('still maps an UNRELATED updateSubscription 400 to 502 (classification is narrow)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json(
          {
            error: {
              code: 'BAD_REQUEST_ERROR',
              description: 'The plan_id provided does not exist',
            },
          },
          { status: 400, statusText: 'Bad Request' },
        ),
      ),
    );

    await expect(
      updateSubscription({ subscriptionId: 'sub_x', planId: 'plan_missing' }),
    ).rejects.toMatchObject({
      code: 'upstream_error',
      status: 502,
    });
  });

  it('still maps an updateSubscription transport failure to 502', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new DOMException('timed out', 'TimeoutError')),
    );

    await expect(
      updateSubscription({ subscriptionId: 'sub_net', planId: 'plan_corporate' }),
    ).rejects.toMatchObject({ code: 'upstream_error', status: 502 });
  });

  it('does NOT apply domestic-card classification to fetchSubscription (other ops unchanged)', async () => {
    // Even if a fetchSubscription response somehow carried the domestic-card
    // description, only the change-plan path reclassifies — fetch stays 502.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json(
          {
            error: {
              code: 'BAD_REQUEST_ERROR',
              description:
                'Only offers can be updated for subscriptions when payment mode is domestic card.',
            },
          },
          { status: 400, statusText: 'Bad Request' },
        ),
      ),
    );

    await expect(fetchSubscription('sub_fetch')).rejects.toMatchObject({
      code: 'upstream_error',
      status: 502,
    });
  });

  describe('isDomesticCardPlanChangeRejection', () => {
    it('matches the verified domestic-card 400 signature (case-insensitive)', () => {
      expect(
        isDomesticCardPlanChangeRejection(
          {
            error: {
              code: 'BAD_REQUEST_ERROR',
              description:
                'ONLY OFFERS CAN BE UPDATED for subscriptions when PAYMENT MODE IS DOMESTIC CARD.',
              source: 'business',
              step: 'plan_change',
              reason: 'input_validation_failed',
            },
          },
          400,
        ),
      ).toBe(true);
    });

    it('does not match a non-400 status', () => {
      expect(
        isDomesticCardPlanChangeRejection(
          {
            error: {
              code: 'BAD_REQUEST_ERROR',
              description:
                'Only offers can be updated for subscriptions when payment mode is domestic card.',
              source: 'business',
              step: 'plan_change',
              reason: 'input_validation_failed',
            },
          },
          500,
        ),
      ).toBe(false);
    });

    it('does not match the UPI limitation description', () => {
      expect(
        isDomesticCardPlanChangeRejection(
          {
            error: {
              code: 'BAD_REQUEST_ERROR',
              description: 'Only offers can be updated for subscriptions when payment mode is upi.',
              source: 'business',
              step: 'plan_change',
              reason: 'input_validation_failed',
            },
          },
          400,
        ),
      ).toBe(false);
    });

    it('does not match an unrelated 400', () => {
      expect(
        isDomesticCardPlanChangeRejection(
          {
            error: {
              code: 'BAD_REQUEST_ERROR',
              description: 'The plan_id provided does not exist',
              source: 'business',
              step: 'plan_change',
              reason: 'input_validation_failed',
            },
          },
          400,
        ),
      ).toBe(false);
    });
  });
});
