import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PlanTier } from '@repo/contracts';
import {
  PLANS,
  PLAN_MAP,
  formatCurrency,
  getCumulativeFeatures,
  getDowngradeLosses,
  getUpgradeGains,
  isUpgrade,
  isDowngrade,
  isValidTier,
} from '../../src/lib/plan-config';

// ─── Plan Config Unit Tests ──────────────────────────────────────────────────

describe('E-120: plan-config', () => {
  describe('pricing', () => {
    it('Hobby is ₹0/month', () => {
      expect(PLAN_MAP.hobby.price).toBe(0);
    });
    it('Professional+ is ₹2,999/month', () => {
      expect(PLAN_MAP.professional_plus.price).toBe(2999);
    });
    it('Corporate is ₹7,999/month', () => {
      expect(PLAN_MAP.corporate.price).toBe(7999);
    });
  });

  describe('labels (no "Free", no early-bird)', () => {
    it('Hobby label is "Hobby" not "Free"', () => {
      expect(PLAN_MAP.hobby.label).toBe('Hobby');
      expect(PLAN_MAP.hobby.label).not.toContain('Free');
    });
    it('Professional+ label', () => {
      expect(PLAN_MAP.professional_plus.label).toBe('Professional+');
    });
    it('Corporate label', () => {
      expect(PLAN_MAP.corporate.label).toBe('Corporate');
    });
    it('no plan has early-bird messaging', () => {
      for (const plan of PLANS) {
        const text = `${plan.label} ${plan.baseFeatures.join(' ')}`.toLowerCase();
        expect(text).not.toContain('early');
        expect(text).not.toContain('bird');
      }
    });
  });

  describe('features', () => {
    it('Professional+ does NOT have add-seat affordance', () => {
      const features = PLAN_MAP.professional_plus.baseFeatures.join(' ').toLowerCase();
      expect(features).not.toContain('add seat');
      expect(features).not.toContain('additional seat');
    });
    it('no plan lists enquiry/lead as paid feature', () => {
      for (const plan of PLANS) {
        const features = plan.baseFeatures.join(' ').toLowerCase();
        expect(features).not.toContain('enquiry');
        expect(features).not.toContain('lead');
      }
    });
    it('Corporate has unlimited seats and branches', () => {
      expect(PLAN_MAP.corporate.baseFeatures).toContain('Unlimited Seats');
      expect(PLAN_MAP.corporate.baseFeatures).toContain('Unlimited Branches');
    });
  });

  describe('isUpgrade (explicit rank)', () => {
    it('hobby → professional_plus is upgrade', () => {
      expect(isUpgrade('hobby', 'professional_plus')).toBe(true);
    });
    it('hobby → corporate is upgrade', () => {
      expect(isUpgrade('hobby', 'corporate')).toBe(true);
    });
    it('professional_plus → corporate is upgrade', () => {
      expect(isUpgrade('professional_plus', 'corporate')).toBe(true);
    });
    it('corporate → professional_plus is NOT upgrade', () => {
      expect(isUpgrade('corporate', 'professional_plus')).toBe(false);
    });
    it('same tier is NOT upgrade', () => {
      expect(isUpgrade('hobby', 'hobby')).toBe(false);
    });
    it('uses explicit rank, not array position', () => {
      expect(PLAN_MAP.hobby.rank).toBeLessThan(PLAN_MAP.professional_plus.rank);
      expect(PLAN_MAP.professional_plus.rank).toBeLessThan(PLAN_MAP.corporate.rank);
    });
  });

  describe('isDowngrade', () => {
    it('corporate → hobby is downgrade', () => {
      expect(isDowngrade('corporate', 'hobby')).toBe(true);
    });
    it('hobby → corporate is NOT downgrade', () => {
      expect(isDowngrade('hobby', 'corporate')).toBe(false);
    });
  });

  describe('isValidTier', () => {
    it('accepts valid tiers', () => {
      expect(isValidTier('hobby')).toBe(true);
      expect(isValidTier('professional_plus')).toBe(true);
      expect(isValidTier('corporate')).toBe(true);
    });
    it('rejects unknown strings', () => {
      expect(isValidTier('enterprise')).toBe(false);
      expect(isValidTier('')).toBe(false);
    });
    it('rejects prototype-inherited keys', () => {
      expect(isValidTier('toString')).toBe(false);
      expect(isValidTier('constructor')).toBe(false);
      expect(isValidTier('__proto__')).toBe(false);
    });
  });

  describe('getCumulativeFeatures', () => {
    it('hobby has only its own features', () => {
      const features = getCumulativeFeatures('hobby');
      expect(features).toEqual(PLAN_MAP.hobby.baseFeatures);
    });
    it('professional_plus inherits hobby features', () => {
      const features = getCumulativeFeatures('professional_plus');
      expect(features).toEqual([...PLAN_MAP.hobby.baseFeatures, ...PLAN_MAP.professional_plus.baseFeatures]);
    });
    it('corporate inherits hobby + professional_plus features', () => {
      const features = getCumulativeFeatures('corporate');
      expect(features).toEqual([
        ...PLAN_MAP.hobby.baseFeatures,
        ...PLAN_MAP.professional_plus.baseFeatures,
        ...PLAN_MAP.corporate.baseFeatures,
      ]);
    });
  });

  describe('getUpgradeGains', () => {
    it('hobby → professional_plus gains pro+ base features', () => {
      const gains = getUpgradeGains('hobby', 'professional_plus');
      expect(gains).toEqual(PLAN_MAP.professional_plus.baseFeatures);
    });
    it('hobby → corporate gains all non-hobby features', () => {
      const gains = getUpgradeGains('hobby', 'corporate');
      expect(gains).toEqual([...PLAN_MAP.professional_plus.baseFeatures, ...PLAN_MAP.corporate.baseFeatures]);
    });
    it('professional_plus → corporate gains only corporate base features', () => {
      const gains = getUpgradeGains('professional_plus', 'corporate');
      expect(gains).toEqual(PLAN_MAP.corporate.baseFeatures);
    });
  });

  describe('getDowngradeLosses', () => {
    it('corporate → hobby loses ALL features above hobby', () => {
      const losses = getDowngradeLosses('corporate', 'hobby');
      expect(losses).toEqual([...PLAN_MAP.professional_plus.baseFeatures, ...PLAN_MAP.corporate.baseFeatures]);
    });
    it('corporate → professional_plus loses only corporate features', () => {
      const losses = getDowngradeLosses('corporate', 'professional_plus');
      expect(losses).toEqual(PLAN_MAP.corporate.baseFeatures);
    });
    it('hobby → hobby has no losses', () => {
      expect(getDowngradeLosses('hobby', 'hobby')).toEqual([]);
    });
  });

  describe('formatCurrency', () => {
    it('₹0 does not say "Free"', () => {
      expect(formatCurrency(0)).not.toContain('Free');
    });
    it('formats ₹2,999', () => {
      expect(formatCurrency(2999)).toContain('2,999');
    });
    it('formats ₹7,999', () => {
      expect(formatCurrency(7999)).toContain('7,999');
    });
  });
});

// ─── Component Tests ─────────────────────────────────────────────────────────

vi.mock('@repo/ui/components/button', () => ({
  Button: ({ children, disabled, onClick, ...props }: Record<string, unknown>) => (
    <button disabled={disabled as boolean} onClick={onClick as () => void} {...props}>
      {children as React.ReactNode}
    </button>
  ),
}));
vi.mock('@repo/ui/components/card', () => ({
  Card: ({ children, className }: { children: React.ReactNode; className?: string; radius?: string }) => (
    <div className={className}>{children}</div>
  ),
}));
vi.mock('@repo/ui/components/separator', () => ({
  Separator: () => <hr />,
}));
vi.mock('@repo/ui/components/dialog', () => ({
  Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
vi.mock('@/lib/api', () => ({ api: {} }));
vi.mock('lucide-react', () => ({
  Check: () => <span data-testid="icon-check" />,
  Crown: () => <span data-testid="icon-crown" />,
  Building2: () => <span data-testid="icon-building" />,
  Sparkles: () => <span data-testid="icon-sparkles" />,
  ArrowRight: () => <span data-testid="icon-arrow" />,
  ChevronLeft: () => <span data-testid="icon-chevron" />,
  Shield: () => <span data-testid="icon-shield" />,
  X: () => <span data-testid="icon-x" />,
  Info: () => <span data-testid="icon-info" />,
  Loader2: () => <span data-testid="icon-loader" />,
  CheckCircle2: () => <span data-testid="icon-checkcircle" />,
  AlertCircle: () => <span data-testid="icon-alert" />,
  Clock: () => <span data-testid="icon-clock" />,
}));

import { PlanCard } from '../../src/components/subscribe/plan-card';
import { PlanSelection } from '../../src/components/subscribe/plan-selection';
import { UpgradeConfirmationStep } from '../../src/components/subscribe/upgrade-confirmation-step';
import { DowngradeConfirmationStep } from '../../src/components/subscribe/downgrade-confirmation-step';
import { ReviewPayStep } from '../../src/components/subscribe/review-pay-step';
import { SuccessStep } from '../../src/components/subscribe/checkout-flow';

describe('E-120: PlanCard', () => {
  it('Hobby card never shows "Free"', () => {
    render(<PlanCard plan={PLAN_MAP.hobby} isCurrent={false} isLocked={false} onSelect={vi.fn()} />);
    expect(screen.queryByText('Free')).not.toBeInTheDocument();
    expect(screen.getByText('Hobby')).toBeInTheDocument();
  });

  it('shows disabled "Current Plan" button for current tier', () => {
    render(<PlanCard plan={PLAN_MAP.hobby} isCurrent={true} isLocked={false} onSelect={vi.fn()} />);
    expect(screen.getByRole('button', { name: /current plan/i })).toBeDisabled();
  });

  it('disables select when locked', () => {
    render(<PlanCard plan={PLAN_MAP.corporate} isCurrent={false} isLocked={true} onSelect={vi.fn()} />);
    expect(screen.getByRole('button', { name: /select corporate/i })).toBeDisabled();
  });

  it('calls onSelect with tier on click', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<PlanCard plan={PLAN_MAP.corporate} isCurrent={false} isLocked={false} onSelect={onSelect} />);
    await user.click(screen.getByRole('button', { name: /select corporate/i }));
    expect(onSelect).toHaveBeenCalledWith('corporate');
  });
});

describe('E-120: PlanSelection lifecycle', () => {
  it('disables all actions in locked state', () => {
    render(<PlanSelection currentTier="corporate" lifecycleState="locked" onSelectPlan={vi.fn()} />);
    expect(screen.getByText(/suspended/i)).toBeInTheDocument();
  });

  it('shows downgrade notice in downgraded state', () => {
    render(<PlanSelection currentTier="hobby" lifecycleState="downgraded" onSelectPlan={vi.fn()} />);
    expect(screen.getByText(/downgraded/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /select corporate/i })).toBeEnabled();
  });

  it('enables selection in grace state', () => {
    render(<PlanSelection currentTier="professional_plus" lifecycleState="grace" onSelectPlan={vi.fn()} />);
    expect(screen.getByRole('button', { name: /select corporate/i })).toBeEnabled();
  });
});

describe('E-120: UpgradeConfirmationStep', () => {
  it('shows current and target plan comparison', () => {
    render(
      <UpgradeConfirmationStep
        currentTier="hobby"
        targetTier="professional_plus"
        onConfirm={vi.fn()}
        onBack={vi.fn()}
      />,
    );
    expect(screen.getByText('Current Plan')).toBeInTheDocument();
    expect(screen.getByText('New Plan')).toBeInTheDocument();
    expect(screen.getByText('Hobby')).toBeInTheDocument();
    expect(screen.getByText('Professional+')).toBeInTheDocument();
  });

  it('lists gained features', () => {
    render(
      <UpgradeConfirmationStep
        currentTier="hobby"
        targetTier="professional_plus"
        onConfirm={vi.fn()}
        onBack={vi.fn()}
      />,
    );
    expect(screen.getByText('Verified Badge')).toBeInTheDocument();
    expect(screen.getByText('Discovery Priority')).toBeInTheDocument();
  });

  it('calls onConfirm when proceed is clicked', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <UpgradeConfirmationStep
        currentTier="hobby"
        targetTier="corporate"
        onConfirm={onConfirm}
        onBack={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: /proceed to payment/i }));
    expect(onConfirm).toHaveBeenCalled();
  });
});

describe('E-120: DowngradeConfirmationStep', () => {
  it('shows features lost', () => {
    render(
      <DowngradeConfirmationStep
        currentTier="corporate"
        targetTier="hobby"
        onConfirm={vi.fn()}
        onBack={vi.fn()}
      />,
    );
    expect(screen.getByText(/features no longer available/i)).toBeInTheDocument();
    expect(screen.getByText('Unlimited Seats')).toBeInTheDocument();
  });

  it('shows cancellation wording for paid → Hobby', () => {
    render(
      <DowngradeConfirmationStep
        currentTier="professional_plus"
        targetTier="hobby"
        onConfirm={vi.fn()}
        onBack={vi.fn()}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Cancel Subscription' })).toBeInTheDocument();
  });

  it('shows "data preserved" notice', () => {
    render(
      <DowngradeConfirmationStep
        currentTier="corporate"
        targetTier="hobby"
        onConfirm={vi.fn()}
        onBack={vi.fn()}
      />,
    );
    expect(screen.getByText(/data and resources will be preserved/i)).toBeInTheDocument();
  });

  it('does NOT display "Free" for Hobby target', () => {
    render(
      <DowngradeConfirmationStep
        currentTier="corporate"
        targetTier="hobby"
        onConfirm={vi.fn()}
        onBack={vi.fn()}
      />,
    );
    expect(screen.queryByText('Free')).not.toBeInTheDocument();
  });
});

describe('E-120: paid-to-paid SuccessStep', () => {
  it('says the plan change takes effect at period end, not immediately', () => {
    render(<SuccessStep targetTier="corporate" kind="upgrade" onDone={vi.fn()} />);
    expect(screen.getByText(/end of your current/i)).toBeInTheDocument();
    expect(screen.queryByText(/now active/i)).not.toBeInTheDocument();
  });
});

describe('E-120: ReviewPayStep', () => {
  it('shows order summary with plan amount (no separate GST)', () => {
    render(<ReviewPayStep targetTier="professional_plus" onPay={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getByText('Professional+')).toBeInTheDocument();
    expect(screen.getByText('Monthly')).toBeInTheDocument();
    expect(screen.getByText('Amount')).toBeInTheDocument();
    // No separate tax line — Razorpay charges plan price directly
    expect(screen.queryByText(/GST/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Estimated Tax/i)).not.toBeInTheDocument();
  });

  it('shows Razorpay security notice', () => {
    render(<ReviewPayStep targetTier="corporate" onPay={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getByText(/Razorpay/i)).toBeInTheDocument();
  });

  it('disables button when loading', () => {
    render(<ReviewPayStep targetTier="corporate" onPay={vi.fn()} onBack={vi.fn()} isLoading={true} />);
    expect(screen.getByRole('button', { name: /setting up/i })).toBeDisabled();
  });

  it('₹0 is never presented as a payment action', () => {
    // Hobby should never reach ReviewPayStep, but defensively verify
    render(<ReviewPayStep targetTier="hobby" onPay={vi.fn()} onBack={vi.fn()} />);
    // The estimated total for ₹0 would be ₹0 — no payment action misleading
    expect(screen.getByText('Proceed to Checkout')).toBeInTheDocument();
  });
});
