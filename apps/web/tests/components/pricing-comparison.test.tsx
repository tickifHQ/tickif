import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PlanSelection } from '../../src/components/subscribe/plan-selection';
import { getCumulativeFeatures } from '../../src/lib/plan-config';

describe('billing pricing comparison', () => {
  it('shows a shared waiting explanation once instead of repeating it under paid plans', () => {
    const reason = 'You can purchase your saved plan once your current subscription ends.';
    render(
      <PlanSelection
        currentTier="hobby"
        lifecycleState="active"
        selectedTier="corporate"
        onSelectPlan={vi.fn()}
        actions={{
          hobby: { hidden: true, disabled: true },
          professional_plus: { hidden: true, disabled: true, reason },
          corporate: { hidden: true, disabled: true, reason },
        }}
      />,
    );
    expect(screen.getAllByText(reason)).toHaveLength(1);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.getByText('Selected plan')).toBeInTheDocument();
  });

  it('keeps plan comparison and selected state visible without duplicate checkout or purchase actions', () => {
    render(
      <PlanSelection
        currentTier="hobby"
        lifecycleState="active"
        selectedTier="corporate"
        onSelectPlan={vi.fn()}
        actions={{
          hobby: { hidden: true, disabled: true },
          professional_plus: {
            hidden: true,
            disabled: true,
            reason: 'Finish your existing checkout before choosing another plan.',
          },
          corporate: {
            hidden: true,
            disabled: true,
            reason: 'Continue your Corporate checkout above.',
          },
        }}
      />,
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    for (const name of ['Hobby', 'Professional+', 'Corporate']) {
      expect(screen.getByRole('heading', { name, level: 3 })).toBeInTheDocument();
    }
    expect(screen.getByText('Current plan')).toBeInTheDocument();
    expect(screen.getByText('Selected plan')).toBeInTheDocument();
    expect(screen.getByText('Continue your Corporate checkout above.')).toBeInTheDocument();
  });

  it('explains why a waiting saved plan cannot be purchased while keeping normal reviews available', async () => {
    const onSelectPlan = vi.fn();
    render(
      <PlanSelection
        currentTier="corporate"
        lifecycleState="active"
        selectedTier="professional_plus"
        onSelectPlan={onSelectPlan}
        actions={{
          professional_plus: {
            hidden: true,
            disabled: true,
            reason:
              'You can purchase Professional+ after your current subscription ends on 1 October.',
          },
        }}
      />,
    );
    expect(
      screen.queryByRole('button', { name: 'Downgrade to Professional+' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(
        'You can purchase Professional+ after your current subscription ends on 1 October.',
      ),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Switch to Hobby' }));
    expect(onSelectPlan).toHaveBeenCalledWith('hobby');
  });

  it('preserves the current badge while enabling an explicitly allowed same-tier renewal', async () => {
    const onSelectPlan = vi.fn();
    render(
      <PlanSelection
        currentTier="corporate"
        lifecycleState="active"
        onSelectPlan={onSelectPlan}
        actions={{
          corporate: {
            disabled: false,
            label: 'Renew Corporate',
            reason: 'Your previous subscription has ended.',
          },
        }}
      />,
    );
    expect(screen.getByText('Current plan')).toBeInTheDocument();
    const renew = screen.getByRole('button', { name: 'Renew Corporate' });
    expect(renew).toBeEnabled();
    expect(renew).toHaveAccessibleDescription('Your previous subscription has ended.');
    await userEvent.click(renew);
    expect(onSelectPlan).toHaveBeenCalledWith('corporate');
  });

  it('does not enable the current tier merely because a custom label was supplied', () => {
    render(
      <PlanSelection
        currentTier="corporate"
        lifecycleState="active"
        onSelectPlan={vi.fn()}
        actions={{ corporate: { label: 'Renew Corporate' } }}
      />,
    );
    expect(screen.getByRole('button', { name: 'Corporate is your current plan' })).toBeDisabled();
  });

  it('replaces Corporate seat and branch limits instead of inheriting conflicting limits', () => {
    const features = getCumulativeFeatures('corporate');
    expect(features).toContain('Unlimited Seats');
    expect(features).toContain('Unlimited Branches');
    expect(features).not.toContain('1 Seat');
    expect(features).not.toContain('1 Branch');
  });

  it('keeps current and selected plans distinct and routes direct Corporate selection', async () => {
    const onSelectPlan = vi.fn();
    render(
      <PlanSelection
        currentTier="hobby"
        lifecycleState="active"
        selectedTier="corporate"
        onSelectPlan={onSelectPlan}
      />,
    );
    expect(screen.getByRole('button', { name: /Hobby is your current plan/ })).toBeDisabled();
    expect(screen.getByText('Selected plan')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Upgrade to Corporate' }));
    expect(onSelectPlan).toHaveBeenCalledWith('corporate');
  });

  it('keeps all plans visible with the reason for an unavailable action', () => {
    render(
      <PlanSelection
        currentTier="corporate"
        lifecycleState="active"
        onSelectPlan={vi.fn()}
        actions={{
          professional_plus: {
            disabled: true,
            reason: 'Provider status is unavailable. Refresh billing to retry.',
          },
        }}
      />,
    );
    const button = screen.getByRole('button', { name: 'Downgrade to Professional+' });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription(
      'Provider status is unavailable. Refresh billing to retry.',
    );
    expect(screen.getByRole('button', { name: 'Switch to Hobby' })).toBeEnabled();
  });

  it('uses labelled desktop columns and mobile values from the same feature groups', () => {
    render(<PlanSelection currentTier="hobby" lifecycleState="active" onSelectPlan={vi.fn()} />);
    const table = screen.getByRole('table', { name: 'Compare plan features' });
    expect(within(table).getByRole('columnheader', { name: 'Corporate' })).toBeInTheDocument();
    expect(within(table).getByRole('rowheader', { name: 'Seats' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Plan features by tier' })).toHaveTextContent(
      'Professional+',
    );
    expect(screen.getByText(/Purchasing a plan does not grant verification/)).toBeInTheDocument();
  });
});
