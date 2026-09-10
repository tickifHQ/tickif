import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { PublicFooter } from '../../src/components/public-footer';

describe('PublicFooter', () => {
  it('renders inside a contentinfo landmark with the current copyright year', () => {
    render(<PublicFooter />);

    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
    expect(screen.getByText(`© ${new Date().getFullYear()} Tickif`)).toBeInTheDocument();
  });

  it('keeps supported destinations and removes the discontinued navigation entries', () => {
    render(<PublicFooter />);

    const navigation = screen.getByRole('navigation');

    expect(within(navigation).getByRole('link', { name: 'Browse' })).toHaveAttribute('href', '/');
    expect(
      within(navigation).queryByRole('link', { name: 'For designers' }),
    ).not.toBeInTheDocument();
    expect(within(navigation).queryByRole('link', { name: 'Designers' })).not.toBeInTheDocument();
    expect(
      within(navigation).queryByRole('link', { name: 'Cost Calculator' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/© \d{4} Tickif/)).toBeInTheDocument();
    expect(screen.queryByText(/Homefolio/)).not.toBeInTheDocument();
  });
});
