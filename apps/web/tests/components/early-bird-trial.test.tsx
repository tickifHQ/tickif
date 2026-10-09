import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { BillingCatalogPlan } from '@repo/contracts';
const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({
  api: { api: { billing: { 'early-bird': { $get: mocks.get, $post: mocks.post } } } },
}));
import { EarlyBirdClaim } from '../../src/components/early-bird-trial';
const plan: BillingCatalogPlan = {
  tier: 'corporate',
  name: 'Corporate',
  description: 'For teams',
  amountPaise: 799900,
  currency: 'INR',
  interval: 'monthly',
  features: ['Unlimited team members'],
};
const trial = {
  tier: 'corporate',
  startedAt: '2026-10-09T06:00:00.000Z',
  endsAt: '2027-01-09T06:00:00.000Z',
};
beforeEach(() => vi.resetAllMocks());

describe('early-bird trial confirmation', () => {
  it('requires an explicit click and sends only the selected tier', async () => {
    mocks.get.mockResolvedValue(Response.json({ eligible: true, trial: null }));
    mocks.post.mockResolvedValue(Response.json({ eligible: false, trial }));
    render(<EarlyBirdClaim plan={plan} />);
    const button = await screen.findByRole('button', { name: 'Start my Corporate trial' });
    expect(mocks.post).not.toHaveBeenCalled();
    await userEvent.click(button);
    expect(mocks.post).toHaveBeenCalledWith({ json: { targetTier: 'corporate' } });
    expect(await screen.findByText('Corporate at ₹0 until 9 January 2027')).toBeInTheDocument();
    expect(screen.getByText(/no automatic charge is scheduled/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Start my/ })).not.toBeInTheDocument();
  });
  it('shows an existing trial without granting it again', async () => {
    mocks.get.mockResolvedValue(Response.json({ eligible: false, trial }));
    render(<EarlyBirdClaim plan={plan} />);
    await screen.findByText('Early-bird trial active');
    expect(mocks.post).not.toHaveBeenCalled();
  });
  it('can retry an eligibility outage without claiming', async () => {
    mocks.get
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ eligible: false, trial: null }));
    render(<EarlyBirdClaim plan={plan} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByText(/not eligible for a new trial/)).toBeInTheDocument();
    expect(mocks.post).not.toHaveBeenCalled();
  });
  it('does not announce activation after a rejected claim', async () => {
    mocks.get.mockResolvedValue(Response.json({ eligible: true, trial: null }));
    mocks.post.mockResolvedValue(new Response(null, { status: 409 }));
    render(<EarlyBirdClaim plan={plan} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Start my Corporate trial' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This offer has ended or has already been used',
    );
    expect(screen.queryByText('Early-bird trial active')).not.toBeInTheDocument();
  });
});
