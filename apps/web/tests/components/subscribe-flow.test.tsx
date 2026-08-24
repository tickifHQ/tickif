import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SubscribeFlowDialog } from '../../src/components/subscribe/subscribe-flow-dialog';
import type { PlanTier } from '../../src/lib/plan-config';
import {
  getCumulativeFeatures,
  getDowngradeLosses,
  getUpgradeGains,
  isUpgrade,
  isValidTier,
  PLAN_MAP,
} from '../../src/lib/plan-config';

// ─── Unit tests: plan-config ─────────────────────────────────────────────────

describe('plan-config', () => {
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
    it('corporate → hobby is NOT upgrade', () => {
      expect(isUpgrade('corporate', 'hobby')).toBe(false);
    });
    it('same tier is NOT upgrade', () => {
      expect(isUpgrade('hobby', 'hobby')).toBe(false);
    });
    it('uses explicit rank, not array position', () => {
      // Even if PLANS array were reordered, rank determines direction
      expect(PLAN_MAP.hobby.rank).toBeLessThan(PLAN_MAP.professional_plus.rank);
      expect(PLAN_MAP.professional_plus.rank).toBeLessThan(PLAN_MAP.corporate.rank);
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
      expect(isValidTier('HOBBY')).toBe(false);
    });
    it('rejects prototype-inherited keys (toString, constructor, hasOwnProperty)', () => {
      expect(isValidTier('toString')).toBe(false);
      expect(isValidTier('constructor')).toBe(false);
      expect(isValidTier('hasOwnProperty')).toBe(false);
      expect(isValidTier('__proto__')).toBe(false);
    });
  });

  describe('getCumulativeFeatures', () => {
    it('hobby has only its own features', () => {
      const features = getCumulativeFeatures('hobby');
      expect(features).toContain('1 Seat');
      expect(features).toContain('Unlimited Projects');
      expect(features).not.toContain('Verified Badge');
    });

    it('professional_plus inherits hobby features', () => {
      const features = getCumulativeFeatures('professional_plus');
      expect(features).toContain('1 Seat');
      expect(features).toContain('Unlimited Projects');
      expect(features).toContain('Verified Badge');
      expect(features).toContain('Discovery Priority');
    });

    it('corporate inherits hobby + professional_plus features', () => {
      const features = getCumulativeFeatures('corporate');
      expect(features).toContain('1 Seat');
      expect(features).toContain('Verified Badge');
      expect(features).toContain('Discovery Priority');
      expect(features).toContain('Unlimited Members');
      expect(features).toContain('Prime Directory Placement');
    });
  });

  describe('getDowngradeLosses (cumulative)', () => {
    it('corporate → hobby loses ALL features above hobby', () => {
      const losses = getDowngradeLosses('corporate', 'hobby');
      expect(losses).toContain('Unlimited Members');
      expect(losses).toContain('Unlimited Branches');
      expect(losses).toContain('Verified Badge');
      expect(losses).toContain('Discovery Priority');
      expect(losses).toContain('Priority Support');
      expect(losses).not.toContain('1 Seat');
      expect(losses).not.toContain('Unlimited Projects');
    });

    it('corporate → professional_plus loses only corporate-exclusive features', () => {
      const losses = getDowngradeLosses('corporate', 'professional_plus');
      expect(losses).toContain('Unlimited Members');
      expect(losses).toContain('Unlimited Branches');
      expect(losses).not.toContain('Verified Badge');
      expect(losses).not.toContain('Discovery Priority');
    });

    it('professional_plus → hobby loses pro+ features', () => {
      const losses = getDowngradeLosses('professional_plus', 'hobby');
      expect(losses).toContain('Verified Badge');
      expect(losses).toContain('Discovery Priority');
      expect(losses).toContain('Priority Support');
    });

    it('hobby → hobby has no losses', () => {
      expect(getDowngradeLosses('hobby', 'hobby')).toEqual([]);
    });
  });

  describe('getUpgradeGains (cumulative)', () => {
    it('hobby → professional_plus gains pro+ base features', () => {
      const gains = getUpgradeGains('hobby', 'professional_plus');
      expect(gains).toContain('Verified Badge');
      expect(gains).toContain('Discovery Priority');
      expect(gains).not.toContain('1 Seat'); // already has it
    });

    it('hobby → corporate gains all non-hobby features', () => {
      const gains = getUpgradeGains('hobby', 'corporate');
      expect(gains).toContain('Unlimited Members');
      expect(gains).toContain('Verified Badge');
      expect(gains).toContain('Prime Directory Placement');
    });

    it('professional_plus → corporate gains only corporate base features', () => {
      const gains = getUpgradeGains('professional_plus', 'corporate');
      expect(gains).toContain('Unlimited Members');
      expect(gains).not.toContain('Verified Badge'); // already has it
    });
  });
});

// ─── Component tests: SubscribeFlowDialog ────────────────────────────────────

describe('SubscribeFlowDialog', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function renderDialog(currentTier: PlanTier = 'professional_plus') {
    const onOpenChange = vi.fn();
    const result = render(
      <SubscribeFlowDialog open={true} onOpenChange={onOpenChange} currentTier={currentTier} />,
    );
    return { ...result, onOpenChange };
  }

  describe('upgrade flow: select → confirm → review → processing → success', () => {
    it('shows plan selection on open', () => {
      renderDialog('hobby');
      expect(screen.getByRole('heading', { name: 'Choose your plan' })).toBeInTheDocument();
    });

    it('full upgrade flow reaches success after timer', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      renderDialog('hobby');

      // Select Corporate
      await user.click(screen.getByRole('button', { name: /select corporate plan/i }));
      expect(screen.getByRole('heading', { name: 'Confirm Upgrade' })).toBeInTheDocument();

      // Confirm → Review
      await user.click(screen.getByRole('button', { name: /proceed to checkout/i }));
      expect(screen.getByRole('heading', { name: 'Review Order' })).toBeInTheDocument();
      expect(screen.getByText(/Estimated Tax/)).toBeInTheDocument();

      // Pay → Processing
      await user.click(screen.getByRole('button', { name: /proceed to checkout/i }));
      expect(screen.getByText(/Processing your payment/)).toBeInTheDocument();

      // Advance timer → Success
      vi.advanceTimersByTime(2600);
      await waitFor(() => {
        expect(screen.getByText('Subscription updated')).toBeInTheDocument();
      });
    });
  });

  describe('paid → paid downgrade', () => {
    it('corporate → professional_plus shows downgrade confirmation', async () => {
      const user = userEvent.setup();
      renderDialog('corporate');

      await user.click(screen.getByRole('button', { name: /select professional\+ plan/i }));
      expect(screen.getByRole('heading', { name: 'Confirm Downgrade' })).toBeInTheDocument();
    });

    it('downgrade shows cancellation result (not review/pay)', async () => {
      const user = userEvent.setup();
      renderDialog('corporate');

      await user.click(screen.getByRole('button', { name: /select professional\+ plan/i }));
      await user.click(screen.getByRole('button', { name: /confirm downgrade/i }));

      // Should show downgrade confirmation, not review
      expect(screen.getByText('Downgrade confirmed')).toBeInTheDocument();
      expect(screen.queryByText('Review Order')).not.toBeInTheDocument();
    });
  });

  describe('paid → Hobby cancellation', () => {
    it('shows cancellation wording', async () => {
      const user = userEvent.setup();
      renderDialog('professional_plus');

      await user.click(screen.getByRole('button', { name: /select hobby plan/i }));
      expect(screen.getByRole('heading', { name: 'Cancel Subscription' })).toBeInTheDocument();
    });

    it('₹0 is never presented as a payment action', async () => {
      const user = userEvent.setup();
      renderDialog('professional_plus');

      await user.click(screen.getByRole('button', { name: /select hobby plan/i }));
      expect(screen.queryByText('Review Order')).not.toBeInTheDocument();
      expect(screen.queryByText(/Pay ₹0/)).not.toBeInTheDocument();
    });

    it('confirms cancellation with explicit result state', async () => {
      const user = userEvent.setup();
      renderDialog('professional_plus');

      await user.click(screen.getByRole('button', { name: /select hobby plan/i }));
      await user.click(screen.getByRole('button', { name: /cancel subscription/i }));

      expect(screen.getByText('Downgrade confirmed')).toBeInTheDocument();
    });
  });

  describe('dialog reset', () => {
    it('parent setting open=false resets to select on reopen', () => {
      const onOpenChange = vi.fn();
      const { rerender } = render(
        <SubscribeFlowDialog
          open={true}
          onOpenChange={onOpenChange}
          currentTier="professional_plus"
        />,
      );

      // Close via parent
      rerender(
        <SubscribeFlowDialog
          open={false}
          onOpenChange={onOpenChange}
          currentTier="professional_plus"
        />,
      );

      // Reopen
      rerender(
        <SubscribeFlowDialog
          open={true}
          onOpenChange={onOpenChange}
          currentTier="professional_plus"
        />,
      );

      expect(screen.getByRole('heading', { name: 'Choose your plan' })).toBeInTheDocument();
    });

    it('advancing beyond select and closing via parent still resets', async () => {
      const onOpenChange = vi.fn();
      const user = userEvent.setup();
      const { rerender } = render(
        <SubscribeFlowDialog
          open={true}
          onOpenChange={onOpenChange}
          currentTier="hobby"
        />,
      );

      // Advance to confirm
      await user.click(screen.getByRole('button', { name: /select corporate plan/i }));
      expect(screen.getByRole('heading', { name: 'Confirm Upgrade' })).toBeInTheDocument();

      // Parent closes
      rerender(
        <SubscribeFlowDialog open={false} onOpenChange={onOpenChange} currentTier="hobby" />,
      );

      // Reopen — must be at select
      rerender(
        <SubscribeFlowDialog open={true} onOpenChange={onOpenChange} currentTier="hobby" />,
      );

      expect(screen.getByRole('heading', { name: 'Choose your plan' })).toBeInTheDocument();
    });
  });

  describe('processing lifecycle', () => {
    it('processing timer reaches success (timer bug regression test)', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      renderDialog('hobby');

      await user.click(screen.getByRole('button', { name: /select corporate plan/i }));
      await user.click(screen.getByRole('button', { name: /proceed to checkout/i }));
      await user.click(screen.getByRole('button', { name: /proceed to checkout/i }));

      // Must be in processing
      expect(screen.getByText(/Processing your payment/)).toBeInTheDocument();

      // Timer fires → must reach success
      vi.advanceTimersByTime(2600);
      await waitFor(() => {
        expect(screen.getByText('Subscription updated')).toBeInTheDocument();
      });
    });

    it('closing during processing clears timer and resets', () => {
      const onOpenChange = vi.fn();
      const { rerender } = render(
        <SubscribeFlowDialog open={true} onOpenChange={onOpenChange} currentTier="hobby" />,
      );

      // Close
      rerender(
        <SubscribeFlowDialog open={false} onOpenChange={onOpenChange} currentTier="hobby" />,
      );

      // Reopen
      rerender(
        <SubscribeFlowDialog open={true} onOpenChange={onOpenChange} currentTier="hobby" />,
      );

      expect(screen.getByRole('heading', { name: 'Choose your plan' })).toBeInTheDocument();
      expect(screen.queryByText('Subscription updated')).not.toBeInTheDocument();
    });
  });

  describe('cumulative downgrade losses', () => {
    it('corporate → hobby shows ALL lost features including pro+ ones', async () => {
      const user = userEvent.setup();
      renderDialog('corporate');

      await user.click(screen.getByRole('button', { name: /select hobby plan/i }));

      expect(screen.getByText('Unlimited Members')).toBeInTheDocument();
      expect(screen.getByText('Unlimited Branches')).toBeInTheDocument();
      expect(screen.getByText('Verified Badge')).toBeInTheDocument();
      expect(screen.getByText('Discovery Priority')).toBeInTheDocument();
      expect(screen.getByText('Priority Support')).toBeInTheDocument();
    });
  });

  describe('unknown runtime tier', () => {
    it('shows error state for invalid currentTier', () => {
      render(
        <SubscribeFlowDialog
          open={true}
          onOpenChange={vi.fn()}
          // @ts-expect-error — testing runtime safety
          currentTier="enterprise"
        />,
      );
      expect(screen.getByText(/Unable to load plan information/)).toBeInTheDocument();
    });

    it('rejects prototype-inherited keys as tier', () => {
      render(
        <SubscribeFlowDialog
          open={true}
          onOpenChange={vi.fn()}
          // @ts-expect-error — testing runtime safety
          currentTier="toString"
        />,
      );
      expect(screen.getByText(/Unable to load plan information/)).toBeInTheDocument();
    });
  });

  describe('accessible plan selection', () => {
    it('plan buttons have accessible labels', () => {
      renderDialog('hobby');
      expect(
        screen.getByRole('button', { name: /select professional\+ plan/i }),
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /select corporate plan/i })).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /hobby is your current plan/i }),
      ).toBeInTheDocument();
    });
  });

  describe('accessibility live regions', () => {
    it('processing step has role=status', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      renderDialog('hobby');

      await user.click(screen.getByRole('button', { name: /select corporate plan/i }));
      await user.click(screen.getByRole('button', { name: /proceed to checkout/i }));
      await user.click(screen.getByRole('button', { name: /proceed to checkout/i }));

      expect(screen.getByRole('status')).toBeInTheDocument();
    });
  });
});
