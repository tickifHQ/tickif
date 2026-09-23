import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { BillingRecovery, BillingSelectionContext } from '@repo/contracts';
const mocks = vi.hoisted(() => ({ dismiss: vi.fn() }));
vi.mock('@/lib/api', () => ({
  api: { api: { billing: { recovery: { dismiss: { $post: mocks.dismiss } } } } },
}));
import { BillingStatusNotice } from '../../src/components/subscribe/saved-recovery-notice';
const saved: BillingRecovery = {
  id: '06757c76-72c6-4fe5-b7b3-dfc9ca2a8524',
  organizationId: 'org',
  targetTier: 'corporate',
  sourceSubscriptionId: 'sub_source',
  actorId: 'user',
  status: 'waiting_for_expiry',
  eligibleAt: '2026-10-01T00:00:00.000Z',
  reason: null,
  revision: 1,
  createdAt: '2026-09-23T00:00:00.000Z',
  updatedAt: '2026-09-23T00:00:00.000Z',
};
const context: BillingSelectionContext = {
  organizationId: 'org',
  currentTier: 'professional_plus',
  sourceSubscriptionId: 'sub_source',
  providerState: 'known',
  actions: [],
  recovery: saved,
  pendingOperation: null,
  scheduledChange: null,
  unfinishedCheckout: null,
};
function notice(overrides: Partial<BillingSelectionContext> = {}, onReview = vi.fn()) {
  return render(
    <BillingStatusNotice
      context={{ ...context, ...overrides }}
      currentTier="professional_plus"
      onReview={onReview}
      onDismissed={vi.fn()}
    />,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.dismiss.mockResolvedValue(Response.json({ recovery: null }));
});
describe('unified billing status notice', () => {
  it('retains the selected plan and next action when the end date is unknown', () => {
    notice({ recovery: { ...saved, eligibleAt: null } });
    expect(
      screen.getByText(
        /The end date is not yet confirmed\. You can purchase Corporate after it ends\./,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /review/i })).not.toBeInTheDocument();
  });
  it('does not invent a Hobby destination for an unknown scheduled target', () => {
    notice({
      recovery: null,
      scheduledChange: { targetTier: null, effectiveAt: '2026-10-01T00:00:00.000Z' },
    });
    expect(screen.getByText(/The new plan is awaiting confirmation/)).toBeInTheDocument();
    expect(screen.queryByText(/changes to Hobby/)).not.toBeInTheDocument();
  });
  it('shows one concise waiting panel without a premature review or removal warning', () => {
    notice();
    expect(screen.getByText('Corporate saved')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Professional+ stays active until 1 Oct 2026. You can purchase Corporate after it ends.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /review/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/automatically|does not undo/)).not.toBeInTheDocument();
    expect(screen.getAllByRole('status')).toHaveLength(1);
  });
  it('offers only the selected eligible plan and does not claim its end date is unknown', async () => {
    const review = vi.fn();
    notice({ recovery: { ...saved, status: 'eligible', eligibleAt: null } }, review);
    await userEvent.click(screen.getByRole('button', { name: 'Review Corporate' }));
    expect(review).toHaveBeenCalledWith('corporate');
    expect(screen.queryByText(/not yet confirmed/)).not.toBeInTheDocument();
  });
  it('prioritizes pending operations over saved recovery and scheduled status', () => {
    notice({
      pendingOperation: {
        operationId: 'b8f77fda-7c77-4f7e-94ec-6efc8f6dc143',
        targetTier: 'hobby',
        status: 'processing',
        reason: 'reconciliation_pending',
      },
      scheduledChange: { targetTier: 'hobby', effectiveAt: null },
    });
    expect(screen.getByText('Confirming plan change…')).toBeInTheDocument();
    expect(screen.queryByText('Corporate saved')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Saved plan options' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
  it('resumes a created checkout without any recovery removal menu', async () => {
    const review = vi.fn();
    notice(
      {
        unfinishedCheckout: {
          targetTier: 'corporate',
          status: 'created',
          razorpaySubscriptionId: 'sub_new',
        },
      },
      review,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Continue checkout' }));
    expect(review).toHaveBeenCalledWith('corporate');
    expect(screen.queryByRole('button', { name: 'Saved plan options' })).not.toBeInTheDocument();
  });
  it('shows payment confirmation without purchase actions for authenticated checkout', () => {
    notice({
      unfinishedCheckout: {
        targetTier: 'corporate',
        status: 'authenticated',
        razorpaySubscriptionId: 'sub_new',
      },
    });
    expect(screen.getByText('Confirming payment…')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
  it('hides completed recovery', () => {
    notice({ recovery: { ...saved, status: 'completed' } });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
  it('requires menu selection and explicit confirmation before removing a saved plan', async () => {
    notice();
    await userEvent.click(screen.getByRole('button', { name: 'Saved plan options' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Remove saved plan' }));
    expect(
      await screen.findByRole('alertdialog', { name: 'Remove saved plan?' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/does not undo a scheduled cancellation/)).toBeInTheDocument();
    expect(mocks.dismiss).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Keep saved plan' }));
    expect(mocks.dismiss).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Saved plan options' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Remove saved plan' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Remove saved plan' }));
    expect(mocks.dismiss).toHaveBeenCalledWith({ json: { expectedRevision: 1 } });
  });
  it('prevents removing a newer revision after the confirmation was opened', async () => {
    const view = notice();
    await userEvent.click(screen.getByRole('button', { name: 'Saved plan options' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Remove saved plan' }));
    await screen.findByRole('alertdialog', { name: 'Remove saved plan?' });
    view.rerender(
      <BillingStatusNotice
        context={{ ...context, recovery: { ...saved, revision: 2 } }}
        currentTier="professional_plus"
        onReview={vi.fn()}
        onDismissed={vi.fn()}
      />,
    );
    const remove = screen.getByRole('button', { name: 'Remove saved plan' });
    expect(remove).toBeDisabled();
    await userEvent.click(remove);
    expect(mocks.dismiss).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Your saved plan changed');
  });
});
