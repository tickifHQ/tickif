import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PublicFooter } from '../../src/components/public-footer';

describe('PublicFooter', () => {
  it('renders the copyright with the current year and Tickif branding (E-292)', () => {
    render(<PublicFooter />);
    const year = new Date().getFullYear();
    expect(screen.getByText(new RegExp(`${year} Tickif`))).toBeInTheDocument();
  });

  it('does not render the stale Homefolio branding (E-292)', () => {
    render(<PublicFooter />);
    expect(screen.queryByText(/Homefolio/i)).not.toBeInTheDocument();
  });

  it('renders inside a contentinfo landmark', () => {
    render(<PublicFooter />);
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
  });

  it('links to the designers discovery page', () => {
    render(<PublicFooter />);
    expect(screen.getByRole('link', { name: 'Designers' })).toHaveAttribute('href', '/designers');
  });
});
