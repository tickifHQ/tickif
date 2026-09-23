import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PlanSelection } from '../../src/components/subscribe/plan-selection';
import { getCumulativeFeatures } from '../../src/lib/plan-config';

describe('billing pricing comparison', () => {
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
