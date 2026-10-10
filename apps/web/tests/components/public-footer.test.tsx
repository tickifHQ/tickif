import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { PublicFooter } from '../../src/components/public-footer';

describe('PublicFooter', () => {
  it.each([false, true])('offers WhatsApp support with landing=%s', (landing) => {
    render(<PublicFooter landing={landing} />);
    expect(screen.getByRole('link', { name: 'WhatsApp support' })).toHaveAttribute(
      'href',
      'https://wa.me/919994645911',
    );
  });
  it('links every Company entry to its Markdown-backed page', () => {
    render(<PublicFooter landing />);
    expect(screen.getByRole('link', { name: 'Pricing' })).toHaveAttribute(
      'href',
      '/#for-designers',
    );
    expect(screen.getByRole('link', { name: 'Verification' })).toHaveAttribute(
      'href',
      '/designer/verification',
    );
    expect(screen.getByRole('heading', { name: 'Company' })).toBeInTheDocument();
    for (const [name, slug] of [
      ['About', 'about'],
      ['Report a problem', 'report-a-problem'],
      ['Takedown policy', 'takedown-policy'],
      ['Terms', 'terms'],
      ['Privacy', 'privacy'],
    ]) {
      expect(screen.getByRole('link', { name: name! })).toHaveAttribute('href', `/company/${slug}`);
    }
  });
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
