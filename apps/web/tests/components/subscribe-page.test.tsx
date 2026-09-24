import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  resolveEntitlements,
  type SubscriptionResponse,
  type SubscriptionState,
} from '@repo/contracts';

const mocks = vi.hoisted(() => ({
  selection: vi.fn(),
  getSubscription: vi.fn(),
  refresh: vi.fn(),
  paymentMethod: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  api: {
    api: {
      billing: {
        'selection-context': { $get: mocks.selection },
        'payment-method': { $post: mocks.paymentMethod },
        subscription: { $get: mocks.getSubscription, refresh: { $get: mocks.refresh } },
      },
    },
  },
}));

vi.mock('@/lib/razorpay-checkout', () => ({
  openRazorpayCheckout: vi.fn(),
}));

vi.mock('@/components/subscribe/checkout-flow', () => ({
  CheckoutFlow: ({
    open,
    initialTargetTier,
    onOpenChange,
    onSubscriptionChange,
  }: {
    open: boolean;
    initialTargetTier: string | null;
    onOpenChange: (open: boolean) => void;
    onSubscriptionChange: () => void;
  }) =>
    open ? (
      <div role="dialog">
        {initialTargetTier}
        <button onClick={() => onOpenChange(false)}>Close billing</button>
        <button onClick={onSubscriptionChange}>Refresh from checkout</button>
      </div>
    ) : null,
}));

import { SubscribePage } from '../../src/components/subscribe/subscribe-page';

beforeEach(() => {
  mocks.refresh.mockImplementation(async () => new Response(null, { status: 200 }));
});

function subscription(lifecycleState: SubscriptionState): SubscriptionResponse {
  const tier = lifecycleState === 'downgraded' ? 'hobby' : 'corporate';
  return {
    tier,
    lifecycleState,
    preLapseTier: lifecycleState === 'downgraded' ? 'corporate' : null,
    razorpayStatus: lifecycleState === 'locked' ? 'halted' : 'active',
    currentPeriodEnd: null,
    cancellationScheduled: false,
    seatUsage: 1,
    branchUsage: 1,
    graceDaysRemaining: null,
    lockedDaysRemaining: null,
    frozenResources: [],
    entitlements: resolveEntitlements(tier, lifecycleState),
  };
}

describe('SubscribePage support recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    mocks.selection.mockImplementation(async () =>
      Response.json({
        organizationId: 'org-a',
        currentTier: 'hobby',
        sourceSubscriptionId: null,
        providerState: 'known',
        unfinishedCheckout: null,
        recovery: null,
        pendingOperation: null,
        scheduledChange: null,
        actions: ['hobby', 'professional_plus', 'corporate'].map((targetTier) => ({
          targetTier,
          action: 'subscribe',
          reason: null,
          effectiveAt: null,
        })),
      }),
    );
  });

  it.each(['locked', 'downgraded'] as const)(
    'links the %s lifecycle recovery notice to WhatsApp Business',
    async (lifecycleState) => {
      mocks.getSubscription.mockImplementation(async () =>
        Response.json(subscription(lifecycleState)),
      );
      render(<SubscribePage />);

      const supportLink = await screen.findByRole('link', { name: /contact support/i });
      expect(supportLink).toHaveAttribute('href', 'https://wa.me/919994645911');
      expect(supportLink).toHaveAttribute('target', '_blank');
      expect(supportLink).toHaveAttribute('rel', 'noopener noreferrer');
    },
  );

  it('links a failed payment recovery attempt to WhatsApp Business', async () => {
    const user = userEvent.setup();
    mocks.getSubscription.mockImplementation(async () =>
      Response.json(subscription('payment_failed')),
    );
    mocks.paymentMethod.mockResolvedValue(new Response(null, { status: 409 }));
    render(<SubscribePage />);

    await screen.findByText('Payment Issue');
    await user.click(screen.getByRole('button', { name: 'Update Payment Method' }));

    const supportLink = await screen.findByRole('link', { name: /contact support/i });
    expect(supportLink).toHaveAttribute('href', 'https://wa.me/919994645911');
    expect(supportLink).toHaveAttribute('target', '_blank');
    expect(supportLink).toHaveAttribute('rel', 'noopener noreferrer');
  });
});

describe('SubscribePage visible comparison and retained selection', () => {
  it('updates pending checkout to the active plan automatically while preserving the mounted dialog', async () => {
    sessionStorage.clear();
    let active = false;
    mocks.getSubscription.mockImplementation(async () =>
      Response.json({
        ...subscription('active'),
        tier: active ? 'corporate' : 'hobby',
        razorpayStatus: active ? 'active' : 'authenticated',
      }),
    );
    mocks.selection.mockImplementation(async () =>
      Response.json({
        organizationId: 'org-auto',
        currentTier: active ? 'corporate' : 'hobby',
        sourceSubscriptionId: 'sub_pending',
        providerState: 'known',
        unfinishedCheckout: active
          ? null
          : { targetTier: 'corporate', status: 'created', razorpaySubscriptionId: 'sub_pending' },
        recovery: null,
        pendingOperation: null,
        scheduledChange: null,
        actions: ['hobby', 'professional_plus', 'corporate'].map((targetTier) => ({
          targetTier,
          action: targetTier === (active ? 'corporate' : 'hobby') ? 'current' : 'subscribe',
          reason: null,
          effectiveAt: null,
        })),
      }),
    );
    render(<SubscribePage userId="user-auto" organizationId="org-auto" />);
    await screen.findByText('Checkout in progress');
    expect(screen.queryByRole('button', { name: /refresh|check status/i })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Continue checkout' }));
    const dialog = screen.getByRole('dialog');
    let finish: ((value: Response) => void) | undefined;
    mocks.getSubscription.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    fireEvent(window, new Event('focus'));
    await waitFor(() => expect(finish).toBeDefined());
    expect(screen.getByRole('dialog')).toBe(dialog);
    expect(dialog).toHaveTextContent('corporate');
    expect(sessionStorage.getItem('tickif:billing-selection:v1:user-auto:org-auto')).toBe(
      'corporate',
    );
    active = true;
    await act(async () => {
      finish?.(Response.json(subscription('active')));
    });
    await waitFor(() => expect(screen.queryByText('Checkout in progress')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Corporate is your current plan' })).toBeDisabled();
    expect(screen.getByRole('dialog')).toBe(dialog);
  });

  it('ignores an old organization response after changing scope', async () => {
    let finishOld: ((value: Response) => void) | undefined;
    mocks.getSubscription.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finishOld = resolve;
        }),
    );
    mocks.getSubscription.mockImplementation(async () =>
      Response.json({ ...subscription('active'), tier: 'hobby' }),
    );
    mocks.selection.mockImplementation(async () =>
      Response.json({
        organizationId: 'org-new',
        currentTier: 'hobby',
        sourceSubscriptionId: null,
        providerState: 'known',
        unfinishedCheckout: null,
        recovery: null,
        pendingOperation: null,
        scheduledChange: null,
        actions: ['hobby', 'professional_plus', 'corporate'].map((targetTier) => ({
          targetTier,
          action: targetTier === 'hobby' ? 'current' : 'subscribe',
          reason: null,
          effectiveAt: null,
        })),
      }),
    );
    const page = render(<SubscribePage userId="user-scope" organizationId="org-old" />);
    await waitFor(() => expect(finishOld).toBeDefined());
    page.rerender(<SubscribePage userId="user-scope" organizationId="org-new" />);
    await screen.findByRole('button', { name: 'Hobby is your current plan' });
    await act(async () => {
      finishOld?.(Response.json(subscription('active')));
    });
    expect(screen.getByRole('button', { name: 'Hobby is your current plan' })).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: 'Corporate is your current plan' }),
    ).not.toBeInTheDocument();
  });

  it('keeps checkout mounted while accepted billing mutations refresh subscription data', async () => {
    mocks.getSubscription.mockResolvedValueOnce(
      Response.json({ ...subscription('active'), tier: 'hobby' }),
    );
    mocks.selection.mockImplementation(async () =>
      Response.json({
        organizationId: 'org-a',
        currentTier: 'hobby',
        sourceSubscriptionId: null,
        providerState: 'known',
        unfinishedCheckout: null,
        recovery: null,
        pendingOperation: null,
        scheduledChange: null,
        actions: ['hobby', 'professional_plus', 'corporate'].map((targetTier) => ({
          targetTier,
          action: 'subscribe',
          reason: null,
          effectiveAt: null,
        })),
      }),
    );
    render(<SubscribePage userId="user-a" organizationId="org-a" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Upgrade to Corporate' }));
    const dialog = screen.getByRole('dialog');
    let completeRefresh: ((response: Response) => void) | undefined;
    mocks.getSubscription.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          completeRefresh = resolve;
        }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Refresh from checkout' }));
    expect(screen.getByRole('dialog')).toBe(dialog);
    expect(dialog).toHaveTextContent('corporate');
    completeRefresh?.(new Response(null, { status: 502 }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Previously loaded billing details are shown',
    );
    expect(screen.getByRole('dialog')).toBe(dialog);
  });
  it('shows every plan and retains Corporate through close, remount, and organization change', async () => {
    const user = userEvent.setup();
    sessionStorage.clear();
    mocks.getSubscription.mockImplementation(async () =>
      Response.json({ ...subscription('active'), tier: 'hobby' }),
    );
    mocks.selection.mockImplementation(async () =>
      Response.json({
        organizationId: 'org-a',
        currentTier: 'hobby',
        sourceSubscriptionId: null,
        providerState: 'known',
        unfinishedCheckout: null,
        recovery: null,
        pendingOperation: null,
        scheduledChange: null,
        actions: ['hobby', 'professional_plus', 'corporate'].map((targetTier) => ({
          targetTier,
          action: 'subscribe',
          reason: null,
          effectiveAt: null,
        })),
      }),
    );
    const first = render(<SubscribePage userId="user-a" organizationId="org-a" />);
    for (const name of ['Hobby', 'Professional+', 'Corporate'])
      expect(await screen.findByRole('heading', { name, level: 3 })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Upgrade to Corporate' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('corporate');
    await user.click(screen.getByRole('button', { name: 'Close billing' }));
    first.unmount();
    const second = render(<SubscribePage userId="user-a" organizationId="org-a" />);
    await user.click(await screen.findByRole('button', { name: 'Continue Corporate' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('corporate');
    second.rerender(<SubscribePage userId="user-a" organizationId="org-b" />);
    await screen.findByRole('heading', { name: 'Subscription' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continue Corporate' })).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Upgrade to Corporate' })).toBeDisabled(),
    );
  });
});
