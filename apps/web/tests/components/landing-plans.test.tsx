import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { LandingPlans, EarlyBirdStrip } from '@/components/landing-plans';
import type { BillingCatalogResponse } from '@repo/contracts';

const catalog: BillingCatalogResponse = {
  earlyBird: { months: 3, claimBefore: '2026-12-31T18:30:00.000Z', cardRequired: false },
  plans: [
    {
      tier: 'corporate',
      name: 'Corporate',
      description: 'For firms with teams',
      amountPaise: 812300,
      currency: 'INR',
      interval: 'monthly',
      features: ['Unlimited seats'],
    },
  ],
};
describe('landing billing catalogue', () => {
  it('lets the visitor pause and resume continuous landing motion', () => {
    render(<EarlyBirdStrip offer={catalog.earlyBird} />);
    fireEvent.click(screen.getByRole('button', { name: 'Pause animations' }));
    expect(screen.getByLabelText('Early-bird offer')).toHaveAttribute('data-motion-paused', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Resume animations' }));
    expect(screen.getByLabelText('Early-bird offer')).toHaveAttribute(
      'data-motion-paused',
      'false',
    );
  });
  it('recommends Professional+ without inventing popularity or changing API prices', () => {
    render(
      <LandingPlans
        catalog={{
          ...catalog,
          plans: [{ ...catalog.plans[0]!, tier: 'professional_plus', name: 'Professional+' }],
        }}
      />,
    );
    expect(screen.getByText('Recommended')).toBeVisible();
    expect(screen.queryByText('Most popular')).toBeNull();
    expect(screen.getByText('₹8,123')).toBeInTheDocument();
  });
  it('renders backend prices and features, and preserves the chosen trial tier', () => {
    render(<LandingPlans catalog={catalog} />);
    expect(screen.getByText('₹8,123')).toBeInTheDocument();
    expect(screen.getByText('Unlimited seats')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Start 3 months free' })).toHaveAttribute(
      'href',
      '/early-bird?plan=corporate',
    );
    expect(screen.getByText(/No automatic charges/)).toBeInTheDocument();
  });
  it('removes trial messaging and the strip when the server closes the campaign', () => {
    render(
      <>
        <EarlyBirdStrip offer={null} />
        <LandingPlans catalog={{ ...catalog, earlyBird: null }} />
      </>,
    );
    expect(screen.queryByText(/3 months/)).toBeNull();
    expect(screen.queryByLabelText('Early-bird offer')).toBeNull();
    expect(screen.getByRole('link', { name: 'Choose Corporate' })).toHaveAttribute(
      'href',
      '/designer/plan-billing/subscribe',
    );
  });
  it('shows the offer strip without fabricated scarcity', () => {
    render(<EarlyBirdStrip offer={catalog.earlyBird} />);
    expect(screen.getByLabelText('Early-bird offer')).toHaveTextContent('3 months free');
    expect(screen.queryByText(/spots left/i)).toBeNull();
  });
  it('does not fall back to made-up prices during an outage', () => {
    render(<LandingPlans catalog={null} />);
    expect(screen.getByRole('status')).toHaveTextContent('temporarily unavailable');
    expect(screen.queryByText(/₹/)).toBeNull();
  });
});
