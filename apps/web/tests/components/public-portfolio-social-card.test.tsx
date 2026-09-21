import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PublicPortfolioSocialCard } from '@/components/public-portfolio-social-card';
import { makePublicPortfolio } from '../fixtures/public-portfolio';

describe('PublicPortfolioSocialCard', () => {
  it('renders profile-specific identity, location, work, rating, and verification data', () => {
    render(<PublicPortfolioSocialCard portfolio={makePublicPortfolio()} />);

    expect(screen.getByText('Anika Spaces')).toBeInTheDocument();
    expect(screen.getByText('Interior Design Studio · Chennai')).toBeInTheDocument();
    expect(screen.getByText('28 projects')).toBeInTheDocument();
    expect(screen.getByText('4.8 rating · 57 reviews')).toBeInTheDocument();
    expect(screen.getByText('Verified on Tickif')).toBeInTheDocument();
  });

  it('omits ratings and verification claims when the profile has neither', () => {
    render(
      <PublicPortfolioSocialCard
        portfolio={makePublicPortfolio({
          isKycVerified: false,
          stats: {
            tickif: null,
            google: null,
            projectCount: 1,
            yearsExperience: 2,
            startingBudget: null,
          },
        })}
      />,
    );

    expect(screen.getByText('1 project')).toBeInTheDocument();
    expect(screen.queryByText(/rating/)).not.toBeInTheDocument();
    expect(screen.queryByText('Verified on Tickif')).not.toBeInTheDocument();
  });
});
