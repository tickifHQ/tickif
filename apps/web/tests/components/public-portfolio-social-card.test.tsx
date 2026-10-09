import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PublicPortfolioSocialCard } from '@/components/public-portfolio-social-card';
import { makePublicPortfolio } from '../fixtures/public-portfolio';

describe('PublicPortfolioSocialCard', () => {
  it('uses the on-page share card facts, cover, ticket and canonical link', () => {
    render(<PublicPortfolioSocialCard portfolio={makePublicPortfolio()} />);
    expect(screen.getByText('Anika Spaces')).toBeInTheDocument();
    expect(screen.getByText('Interior Design Studio · Chennai')).toBeInTheDocument();
    for (const text of [
      'Projects',
      '28',
      'Established',
      '2018',
      'Starting at',
      '₹10L+',
      'Rating',
      '4.7',
      'Verified',
    ]) {
      expect(screen.getByText(text)).toBeInTheDocument();
    }
    expect(screen.getByRole('img', { name: 'Anika Spaces portfolio preview' })).toHaveAttribute(
      'src',
      'https://cdn.example.test/portfolio-covers/anika-spaces.jpg',
    );
    expect(screen.getByText('localhost:3000/d/anika-spaces')).toBeInTheDocument();
  });

  it('respects hidden rating and verification controls', () => {
    const portfolio = makePublicPortfolio();
    render(
      <PublicPortfolioSocialCard
        portfolio={{
          ...portfolio,
          sections: { ...portfolio.sections, overallRating: false, tickifBadge: false },
        }}
      />,
    );
    expect(screen.queryByText('Rating')).not.toBeInTheDocument();
    expect(screen.queryByText('Verified')).not.toBeInTheDocument();
    expect(screen.getByText('Portfolio')).toBeInTheDocument();
  });

  it('matches the on-page Google rating fallback when Tickif reviews are absent', () => {
    const portfolio = makePublicPortfolio();
    render(
      <PublicPortfolioSocialCard
        portfolio={{ ...portfolio, stats: { ...portfolio.stats, tickif: null } }}
      />,
    );
    expect(screen.getByText('4.8')).toBeInTheDocument();
  });

  it('contains the uploaded logo and falls back cleanly when cover and optional facts are absent', () => {
    const portfolio = makePublicPortfolio({
      logoUrl: 'https://cdn.example.test/logo.png',
      heroCoverUrl: null,
      foundedYear: null,
    });
    render(
      <PublicPortfolioSocialCard
        portfolio={{
          ...portfolio,
          stats: { ...portfolio.stats, tickif: null, google: null, startingBudget: null },
        }}
      />,
    );
    expect(screen.getByRole('img', { name: 'Anika Spaces logo' })).toHaveStyle({
      objectFit: 'contain',
    });
    expect(screen.queryByRole('img', { name: /portfolio preview/ })).not.toBeInTheDocument();
    expect(screen.queryByText('Established')).not.toBeInTheDocument();
    expect(screen.queryByText('Starting at')).not.toBeInTheDocument();
    expect(screen.queryByText('Rating')).not.toBeInTheDocument();
  });

  it('keeps the studio initials and bounds long names in the fixed canvas', () => {
    render(
      <PublicPortfolioSocialCard
        portfolio={makePublicPortfolio({ displayName: 'N'.repeat(100) })}
      />,
    );
    expect(screen.getByText('NN')).toBeInTheDocument();
    expect(screen.getByText(`${'N'.repeat(71)}…`)).toBeInTheDocument();
  });
});
