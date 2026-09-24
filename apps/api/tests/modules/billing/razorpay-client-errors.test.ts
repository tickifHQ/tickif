import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@repo/config', () => ({
  config: {
    RAZORPAY_KEY_ID: 'rzp_test_fixture',
    RAZORPAY_KEY_SECRET: 'billing-test-secret',
  },
}));

const {
  fetchSubscription,
  fetchPlan,
  fetchScheduledChanges,
  updateSubscription,
  isDomesticCardPlanChangeRejection,
} = await import('../../../src/modules/billing/razorpay-client.js');

describe('billing / razorpay-client failures', () => {
  it.each([
    ['fetch', 400, 'BAD_REQUEST_ERROR', 'subscriptions cannot be updated when payment mode is UPI'],
    [
      'update',
      500,
      'BAD_REQUEST_ERROR',
      'subscriptions cannot be updated when payment mode is UPI',
    ],
    ['update', 400, 'SERVER_ERROR', 'subscriptions cannot be updated when payment mode is UPI'],
    ['update', 400, 'BAD_REQUEST_ERROR', 'UPI payment processing is temporarily unavailable'],
  ] as const)(
    'keeps unrelated %s/%s/%s errors uncertain',
    async (operation, status, code, description) => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(Response.json({ error: { code, description } }, { status })),
      );
      await expect(
        operation === 'fetch'
          ? fetchSubscription('sub_upi')
          : updateSubscription({ subscriptionId: 'sub_upi', planId: 'plan_corporate' }),
      ).rejects.toMatchObject({ code: 'upstream_error', status: 502 });
    },
  );
  it('classifies the documented UPI update rejection as an actionable limitation', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json(
          {
            error: {
              code: 'BAD_REQUEST_ERROR',
              description: 'subscriptions cannot be updated when payment mode is UPI',
            },
          },
          { status: 400 },
        ),
      ),
    );
    await expect(
      updateSubscription({ subscriptionId: 'sub_upi', planId: 'plan_corporate' }),
    ).rejects.toMatchObject({ code: 'payment_mode_change_unsupported', status: 422 });
  });
  it('rejects malformed successful responses instead of trusting casts', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ id: 'sub_missing_plan' })));
    await expect(fetchSubscription('sub_missing_plan')).rejects.toMatchObject({
      code: 'upstream_error',
    });
  });

  it('rejects a fractional plan amount and a different plan identity', async () => {
    const plan = {
      id: 'plan_other',
      entity: 'plan',
      interval: 1,
      period: 'monthly',
      item: { id: 'item_one', name: 'Plan', amount: 299900, currency: 'INR' },
      created_at: 1,
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(plan)));
    await expect(fetchPlan('plan_expected')).rejects.toMatchObject({ code: 'upstream_error' });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ ...plan, item: { ...plan.item, amount: 1.5 } })),
    );
    await expect(fetchPlan('plan_other')).rejects.toMatchObject({ code: 'upstream_error' });
  });

  it('reads scheduled target separately and normalizes cancellation without treating zero as true', async () => {
    const subscription = {
      id: 'sub_scheduled',
      entity: 'subscription',
      plan_id: 'plan_next',
      status: 'active',
      current_start: 1,
      current_end: 2,
      short_url: null,
      created_at: 1,
      cancel_at_cycle_end: 0,
      notes: [],
      has_scheduled_changes: true,
      change_scheduled_at: 2,
    };
    const fetchMock = vi.fn().mockResolvedValue(Response.json(subscription));
    vi.stubGlobal('fetch', fetchMock);
    expect(await fetchScheduledChanges('sub_scheduled')).toMatchObject({
      plan_id: 'plan_next',
      cancel_at_cycle_end: false,
      notes: {},
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.razorpay.com/v1/subscriptions/sub_scheduled/retrieve_scheduled_changes',
      expect.objectContaining({ method: 'GET' }),
    );
  });
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
