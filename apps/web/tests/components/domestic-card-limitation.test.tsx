/**
 * E-289: domestic-card Professional+ → Corporate upgrade limitation flow.
 *
 * Drives the real CheckoutFlow state machine through the paid → paid
 * (change-plan) branch and asserts that a `payment_mode_change_unsupported`
 * response routes to the capability-aware domestic-card limitation UI (not the
 * generic error step), that scheduling cancellation calls the existing
 * /api/billing/cancel endpoint with deferred-cancel semantics, that a genuine
 * 502 still shows the generic error step, and that the existing UPI limitation
 * behaviour is unchanged.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mocks = vi.hoisted(() => ({
  changePlan: vi.fn(),
  cancel: vi.fn(),
  checkout: vi.fn(),
}));

vi.mock('@/lib/razorpay-checkout', () => ({ openRazorpayCheckout: mocks.checkout }));
vi.mock('@/lib/subscription-activation', () => ({ waitForSubscriptionActivation: vi.fn() }));
vi.mock('@/lib/api', () => ({
  api: {
    api: {
      billing: {
        'change-plan': { $post: mocks.changePlan },
        cancel: { $post: mocks.cancel },
      },
    },
  },
}));

import { CheckoutFlow } from '../../src/components/subscribe/checkout-flow';

function renderUpgrade() {
  return render(
    <CheckoutFlow
      open
      onOpenChange={() => {}}
      currentTier="professional_plus"
      lifecycleState="active"
      cancellationScheduled={false}
      currentPeriodEnd="2026-10-01T00:00:00.000Z"
      initialTargetTier="corporate"
      onSubscriptionChange={() => {}}
    />,
  );
}

/** Advance the flow from the initial confirm-upgrade step to the pay action. */
async function proceedToCheckout(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: /proceed to payment review/i }));
  await user.click(await screen.findByRole('button', { name: /proceed to checkout/i }));
}

describe('E-289: domestic-card limitation flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('routes a payment_mode_change_unsupported response to the domestic-card limitation UI', async () => {
    const user = userEvent.setup();
    mocks.changePlan.mockResolvedValue(
      Response.json(
        {
          error: {
            code: 'payment_mode_change_unsupported',
            message: 'This subscription was set up with a payment method that does not support changing plans directly.',
          },
        },
        { status: 422 },
      ),
    );

    renderUpgrade();
    await proceedToCheckout(user);

    // Capability-aware limitation heading appears...
    expect(
      await screen.findByRole('heading', { name: /plan change unavailable/i }),
    ).toBeInTheDocument();
    // ...and the deferred-cancel action is offered.
    expect(screen.getByRole('button', { name: /schedule cancellation/i })).toBeInTheDocument();
    // It must NOT be the generic error step.
    expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/plan change failed/i)).not.toBeInTheDocument();
  });

  it('communicates deferred cancellation without implying an immediate switch', async () => {
    const user = userEvent.setup();
    mocks.changePlan.mockResolvedValue(
      Response.json({ error: { code: 'payment_mode_change_unsupported', message: 'x' } }, { status: 422 }),
    );

    renderUpgrade();
    await proceedToCheckout(user);
    await screen.findByRole('heading', { name: /plan change unavailable/i });

    // Deferred-cancel semantics are explained; no claim of instant migration.
    expect(screen.getByText(/stays active until the end of your current billing period/i)).toBeInTheDocument();
    expect(screen.getByText(/nothing is cancelled immediately/i)).toBeInTheDocument();
  });

  it('scheduling cancellation calls the existing /api/billing/cancel endpoint', async () => {
    const user = userEvent.setup();
    mocks.changePlan.mockResolvedValue(
      Response.json({ error: { code: 'payment_mode_change_unsupported', message: 'x' } }, { status: 422 }),
    );
    mocks.cancel.mockResolvedValue(
      Response.json({
        razorpaySubscriptionId: 'sub_domestic',
        alreadyCancelled: false,
        currentPeriodEnd: '2026-10-01T00:00:00.000Z',
      }),
    );

    renderUpgrade();
    await proceedToCheckout(user);
    await user.click(await screen.findByRole('button', { name: /schedule cancellation/i }));

    await waitFor(() => expect(mocks.cancel).toHaveBeenCalledTimes(1));
    // Reuses the existing cancel endpoint (deferred cancel), not a new one.
    expect(mocks.cancel).toHaveBeenCalledWith({});
    expect(
      await screen.findByRole('heading', { name: /cancellation scheduled/i }),
    ).toBeInTheDocument();
  });

  it('still shows the generic error step for a genuine 502 (regression guard)', async () => {
    const user = userEvent.setup();
    // Genuine upstream failure: 502 with a non-JSON body (bad gateway).
    mocks.changePlan.mockResolvedValue(new Response('<html>bad gateway</html>', { status: 502 }));

    renderUpgrade();
    await proceedToCheckout(user);

    expect(await screen.findByText(/plan change failed \(502\)/i)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /plan change unavailable/i })).not.toBeInTheDocument();
  });

  it('still routes the UPI limitation to the UPI step (existing behaviour unchanged)', async () => {
    const user = userEvent.setup();
    mocks.changePlan.mockResolvedValue(
      Response.json(
        {
          error: {
            code: 'upstream_error',
            message:
              'Razorpay updateSubscription failed: Only offers can be updated for subscriptions when payment mode is upi.',
          },
        },
        { status: 502 },
      ),
    );

    renderUpgrade();
    await proceedToCheckout(user);

    // UPI copy specifically references UPI; both limitation steps share the
    // "Plan change unavailable" heading, so assert on the UPI-specific text.
    expect(await screen.findByText(/uses UPI/i)).toBeInTheDocument();
  });
});
