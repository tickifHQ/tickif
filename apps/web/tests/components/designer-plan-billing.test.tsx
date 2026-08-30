import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { BillingState } from '../../src/lib/billing-types';
import { DesignerPlanBilling } from '../../src/components/designer-plan-billing';
import { BillingStatusBanner } from '../../src/components/billing-status-banner';
import { BillingAccessDenied } from '../../src/components/billing-access-denied';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeBilling(overrides: Partial<BillingState> = {}): BillingState {
  return {
    lifecycle: 'active',
    tier: 'professional_plus',
    razorpayStatus: 'active',
    cancellationScheduled: false,
    preLapseTier: null,
    renewalDate: '2099-12-12',
    subscriptionId: 'sub_TEST_123',
    usage: {
      seats: { label: 'Team Seats', current: 1, limit: 1, unit: 'seats' },
      branches: { label: 'Branches', current: 1, limit: 1, unit: 'branches' },
    },
    billing: {
      nextBillingDate: '2099-12-12',
      billingCycle: 'monthly',
      planAmount: 2999,
      tax: 539.82,
      total: 3538.82,
      paymentMethodLast4: '4242',
      paymentMethodBrand: 'Visa',
    },
    graceDaysRemaining: null,
    lockedDaysRemaining: null,
    lastPaymentFailedDate: null,
    frozenResources: [],
    lockedAccess: null,
    ...overrides,
  };
}

// ─── Access Control ──────────────────────────────────────────────────────────

describe('BillingAccessDenied', () => {
  it('renders the access-denied message', () => {
    render(<BillingAccessDenied />);
    expect(screen.getByText('Billing access restricted')).toBeInTheDocument();
    expect(screen.getByText(/Only the organization Owner/)).toBeInTheDocument();
  });

  it('provides a link back to the dashboard', () => {
    render(<BillingAccessDenied />);
    expect(screen.getByRole('link', { name: /back to dashboard/i })).toHaveAttribute(
      'href',
      '/designer',
    );
  });
});

// ─── Lifecycle-Aware Rendering ───────────────────────────────────────────────

describe('DesignerPlanBilling', () => {
  describe('active state', () => {
    it('renders the current plan name and price', () => {
      render(<DesignerPlanBilling billing={makeBilling()} />);
      expect(screen.getByText('Professional+')).toBeInTheDocument();
      expect(screen.getByText('Current Plan')).toBeInTheDocument();
    });

    it('shows renewal date for active paid plans', () => {
      render(<DesignerPlanBilling billing={makeBilling()} />);
      expect(screen.getByText(/renews on/)).toBeInTheDocument();
    });

    it('does not show "Popular" badge', () => {
      render(<DesignerPlanBilling billing={makeBilling()} />);
      expect(screen.queryByText('Popular')).not.toBeInTheDocument();
    });

    it('shows billing summary for active paid plans', () => {
      render(<DesignerPlanBilling billing={makeBilling()} />);
      expect(screen.getByText('Billing Summary')).toBeInTheDocument();
    });

    it('opens the subscribe dialog from Upgrade Now', async () => {
      const user = userEvent.setup();
      render(<DesignerPlanBilling billing={makeBilling({ tier: 'hobby', billing: null })} />);
      await user.click(screen.getAllByRole('button', { name: 'Upgrade Now' })[0]!);
      expect(screen.getByRole('heading', { name: 'Choose your plan' })).toBeInTheDocument();
    });
  });

  describe('locked state', () => {
    const lockedBilling = makeBilling({
      lifecycle: 'locked',
      lockedDaysRemaining: 25,
      lockedAccess: {
        suspended: ['New project creation', 'Lead responses'],
        available: ['View existing projects', 'Public portfolio (read-only)'],
      },
    });

    it('shows the Locked badge', () => {
      render(<DesignerPlanBilling billing={lockedBilling} />);
      expect(screen.getByText('Locked')).toBeInTheDocument();
    });

    it('hides billing summary when locked', () => {
      render(<DesignerPlanBilling billing={lockedBilling} />);
      expect(screen.queryByText('Billing Summary')).not.toBeInTheDocument();
    });

    it('shows suspended and available access lists', () => {
      render(<DesignerPlanBilling billing={lockedBilling} />);
      expect(screen.getByText('New project creation')).toBeInTheDocument();
      expect(screen.getByText('View existing projects')).toBeInTheDocument();
    });

    it('marks paid features as suspended in plan-includes card', () => {
      render(<DesignerPlanBilling billing={lockedBilling} />);
      // The "Suspended" badges should appear for features like Verified Badge
      expect(screen.getAllByText('Suspended').length).toBeGreaterThan(0);
    });

    it('hides upgrade offers when locked', () => {
      render(<DesignerPlanBilling billing={lockedBilling} />);
      expect(screen.queryByText('Upgrade Now')).not.toBeInTheDocument();
    });

    it('opens reactivation flow from the locked CTA', async () => {
      const user = userEvent.setup();
      render(<DesignerPlanBilling billing={lockedBilling} />);
      const cta = screen.getByRole('button', { name: 'Reactivate Subscription' });
      expect(cta).toBeEnabled();
      await user.click(cta);
      // CheckoutFlow opens plan selection with locked-state UI
      expect(screen.getByRole('heading', { name: 'Choose your plan' })).toBeInTheDocument();
    });
  });

  describe('grace state', () => {
    it('shows Payment Due badge', () => {
      render(
        <DesignerPlanBilling billing={makeBilling({ lifecycle: 'grace', graceDaysRemaining: 5 })} />,
      );
      expect(screen.getByText('Payment Due')).toBeInTheDocument();
    });
  });

  describe('downgraded state', () => {
    const downgradedBilling = makeBilling({
      lifecycle: 'downgraded',
      tier: 'hobby',
      preLapseTier: 'corporate',
      billing: null,
      frozenResources: [
        { label: 'Additional Seats', quantity: 4, recoverable: true },
        { label: 'Branches', quantity: 3, recoverable: true },
      ],
    });

    it('shows Hobby as the current plan with the pre-lapse tier', () => {
      render(<DesignerPlanBilling billing={downgradedBilling} />);
      expect(screen.getByText('Hobby')).toBeInTheDocument();
      expect(screen.getByText(/from Corporate/)).toBeInTheDocument();
    });

    it('shows frozen resources as recoverable', () => {
      render(<DesignerPlanBilling billing={downgradedBilling} />);
      expect(screen.getByText('Frozen Resources')).toBeInTheDocument();
      expect(screen.getAllByText('Recoverable').length).toBe(2);
      expect(screen.getAllByText('Frozen').length).toBeGreaterThan(0);
    });

    it('hides billing summary when downgraded', () => {
      render(<DesignerPlanBilling billing={downgradedBilling} />);
      expect(screen.queryByText('Billing Summary')).not.toBeInTheDocument();
    });

    it('opens restore upgrade from Upgrade to Restore', async () => {
      const user = userEvent.setup();
      render(<DesignerPlanBilling billing={downgradedBilling} />);
      await user.click(screen.getAllByRole('button', { name: 'Upgrade to Restore' })[0]!);
      // CheckoutFlow opens plan selection with downgraded-state UI
      expect(screen.getByRole('heading', { name: 'Choose your plan' })).toBeInTheDocument();
    });
  });

  describe('corporate unlimited seats', () => {
    it('displays "Unlimited seats" when limit is null', () => {
      render(
        <DesignerPlanBilling
          billing={makeBilling({
            tier: 'corporate',
            usage: {
              seats: { label: 'Team Seats', current: 5, limit: null, unit: 'seats' },
              branches: { label: 'Branches', current: 4, limit: null, unit: 'branches' },
            },
          })}
        />,
      );
      expect(screen.getByText('Unlimited seats')).toBeInTheDocument();
    });
  });
});

// ─── Billing Status Banner ───────────────────────────────────────────────────

describe('BillingStatusBanner', () => {
  it('returns null for active lifecycle', () => {
    const { container } = render(<BillingStatusBanner lifecycle="active" />);
    expect(container.firstChild).toBeNull();
  });

  it('shows grace message with day count when provided', () => {
    render(<BillingStatusBanner lifecycle="grace" graceDaysRemaining={3} />);
    expect(screen.getByText(/3 days remaining/)).toBeInTheDocument();
  });

  it('does not fabricate day count when graceDaysRemaining is null', () => {
    render(<BillingStatusBanner lifecycle="grace" graceDaysRemaining={null} />);
    expect(screen.queryByText(/days remaining/)).not.toBeInTheDocument();
    expect(screen.getByText(/Payment due/i)).toBeInTheDocument();
  });

  it('shows locked message with countdown when provided', () => {
    render(<BillingStatusBanner lifecycle="locked" lockedDaysRemaining={20} />);
    expect(screen.getByText(/20 days/)).toBeInTheDocument();
    expect(screen.getByText(/reactivate to restore full access/i)).toBeInTheDocument();
  });

  it('does not fabricate locked countdown when null', () => {
    render(<BillingStatusBanner lifecycle="locked" lockedDaysRemaining={null} />);
    expect(screen.queryByText(/days to/)).not.toBeInTheDocument();
  });

  it('shows expired copy when remaining days are 0 or negative', () => {
    render(<BillingStatusBanner lifecycle="grace" graceDaysRemaining={0} />);
    expect(screen.getByText(/grace period has expired/i)).toBeInTheDocument();
    expect(screen.queryByText(/0 days remaining/)).not.toBeInTheDocument();
  });

  it('shows payment failed message', () => {
    render(<BillingStatusBanner lifecycle="payment_failed" />);
    expect(screen.getByText(/Payment failed/)).toBeInTheDocument();
  });
});
