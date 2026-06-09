import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SiteFooter } from '../../src/components/site-footer';

describe('SiteFooter', () => {
  it('renders the copyright with the current year', () => {
    render(<SiteFooter />);
    const year = new Date().getFullYear();
    expect(screen.getByText(new RegExp(`${year} Tickif`))).toBeInTheDocument();
  });

  it('renders inside a contentinfo landmark', () => {
    render(<SiteFooter />);
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
  });
});
