import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PublicDesignerProfile } from '../../src/components/public-designer-profile';
import { makeProjects, makePublicPortfolio, makeReview } from '../fixtures/public-portfolio';

describe('PublicDesignerProfile', () => {
  it('renders every section from the API payload', () => {
    render(<PublicDesignerProfile portfolio={makePublicPortfolio()} />);

    expect(screen.getByRole('heading', { name: 'Anika Spaces', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Verified on Tickif' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Selected projects/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /their words/i })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'What it’s like to work with us.' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Anika Spaces', level: 2 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /A portfolio worth sharing/i })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        name: "Let's build something you can't imagine living without.",
      }),
    ).toBeInTheDocument();
    const tickifLogo = screen.getByRole('img', { name: 'Tickif' });
    expect(tickifLogo).toHaveClass('size-4', 'text-primary');
    expect(screen.getByText('28 Projects').previousElementSibling).toHaveClass(
      'size-3',
      'shrink-0',
      'text-muted-foreground',
    );
  });

  it('renders only the badges the API awarded, not the full badge set', () => {
    const { container } = render(
      <PublicDesignerProfile
        portfolio={makePublicPortfolio({ badges: ['verified', 'top-performer'] })}
      />,
    );

    expect(within(container).getByAltText('Identity verified')).toBeInTheDocument();
    expect(within(container).getByAltText('Top performer')).toBeInTheDocument();
    expect(within(container).queryByAltText('New on Tickif')).not.toBeInTheDocument();
    expect(within(container).queryByAltText('Established studio')).not.toBeInTheDocument();
    expect(within(container).queryByAltText('Projects published')).not.toBeInTheDocument();
  });

  it('renders the reviews the API returned, once to assistive technology', () => {
    const reviews = [
      makeReview({ id: 'r1', author: 'Rahul S.' }),
      makeReview({ id: 'r2', author: 'Meera & Karthik', rating: 5 }),
    ];
    render(<PublicDesignerProfile portfolio={makePublicPortfolio({ reviews })} />);

    const primaryReviews = within(screen.getByTestId('review-marquee-primary'));
    const reviewCards = primaryReviews.getAllByRole('article');

    expect(reviewCards).toHaveLength(2);
    expect(within(reviewCards[0]!).getByText('Rahul S.')).toBeInTheDocument();
    expect(screen.getByTestId('review-marquee-copy')).toHaveAttribute('aria-hidden', 'true');
  });

  it('explains the empty state instead of an empty rail when there are no reviews', () => {
    render(
      <PublicDesignerProfile
        portfolio={makePublicPortfolio({ reviews: [] })}
      />,
    );

    expect(screen.queryByTestId('review-marquee')).not.toBeInTheDocument();
    expect(
      screen.getByText('No reviews are available for Anika Spaces yet.'),
    ).toBeInTheDocument();
  });

  it('keeps Google ratings visible when Tickif has no published reviews', () => {
    const portfolio = makePublicPortfolio();
    render(
      <PublicDesignerProfile
        portfolio={{
          ...portfolio,
          stats: {
            ...portfolio.stats,
            tickif: { rating: 0, reviewCount: 0 },
          },
        }}
      />,
    );

    expect(screen.getByText('Based on 57 Google reviews')).toBeInTheDocument();
    expect(screen.getByText('57 Google reviews')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Google reviews' })).toBeInTheDocument();
    expect(screen.queryByText('Based on 0 verified reviews')).not.toBeInTheDocument();
  });

  it('renders both source aggregates without merging their counts', () => {
    render(<PublicDesignerProfile portfolio={makePublicPortfolio()} />);

    expect(screen.getByText('Based on 42 verified reviews')).toBeInTheDocument();
    expect(screen.getByText('Based on 57 Google reviews')).toBeInTheDocument();
  });

  it('marks only completed Tickif consultations as verified and supports rating-only reviews', () => {
    const reviews = [
      makeReview({
        id: 'tickif-rating-only',
        source: 'tickif',
        text: null,
        verifiedConsultation: true,
      }),
    ];
    render(<PublicDesignerProfile portfolio={makePublicPortfolio({ reviews })} />);

    expect(
      within(screen.getByTestId('review-marquee-primary')).getByLabelText(
        'Verified consultation',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('“”')).not.toBeInTheDocument();
  });

  it('hides sections the designer switched off in portfolio settings', () => {
    const portfolio = makePublicPortfolio();
    render(
      <PublicDesignerProfile
        portfolio={{
          ...portfolio,
          sections: {
            ...portfolio.sections,
            trustCredentials: false,
            featuredTestimonial: false,
            reviews: false,
            shareBlock: false,
          },
        }}
      />,
    );

    expect(screen.queryByRole('heading', { name: 'Verified on Tickif' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /their words/i })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'What it’s like to work with us.' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: /A portfolio worth sharing/i }),
    ).not.toBeInTheDocument();
    // The studio section still renders — it isn't gated.
    expect(screen.getByRole('heading', { name: 'Anika Spaces', level: 2 })).toBeInTheDocument();
  });

  it('withholds the rating everywhere when showOverallRating is off', () => {
    const portfolio = makePublicPortfolio();
    render(
      <PublicDesignerProfile
        portfolio={{
          ...portfolio,
          sections: { ...portfolio.sections, overallRating: false },
        }}
      />,
    );

    expect(screen.queryByText('Based on 42 verified reviews')).not.toBeInTheDocument();
    expect(screen.queryByText('Rating')).not.toBeInTheDocument();
  });

  it('renders the studio identity, real stats, and real social handles', () => {
    render(<PublicDesignerProfile portfolio={makePublicPortfolio()} />);

    const studioSection = screen
      .getByRole('heading', { name: 'Anika Spaces', level: 2 })
      .closest('section');

    if (!studioSection) {
      throw new Error('Studio section was not rendered');
    }

    const studio = within(studioSection);
    expect(studio.getByLabelText('Verified studio')).toBeInTheDocument();
    expect(studio.getByText('Established')).toBeInTheDocument();
    expect(studio.getByText('2018')).toBeInTheDocument();
    expect(studio.getByText('Projects published')).toBeInTheDocument();
    expect(studio.getByText('₹10L+')).toBeInTheDocument();
    expect(studio.getAllByText('@anika')).toHaveLength(2);
    expect(studio.getByRole('link', { name: 'anikaspaces.in' })).toHaveAttribute(
      'href',
      'https://anikaspaces.in',
    );
  });

  it('omits studio facts the designer has not filled in', () => {
    render(
      <PublicDesignerProfile
        portfolio={makePublicPortfolio({
          foundedYear: null,
          social: {
            websiteUrl: null,
            instagramHandle: null,
            linkedinHandle: null,
            youtubeHandle: null,
          },
          stats: {
            tickif: null,
            google: null,
            projectCount: 3,
            yearsExperience: 0,
            startingBudget: null,
          },
        })}
      />,
    );

    expect(screen.queryByText('Established')).not.toBeInTheDocument();
    expect(screen.queryByText('Typical budget')).not.toBeInTheDocument();
    expect(screen.queryByText('anikaspaces.in')).not.toBeInTheDocument();
    expect(screen.getByText('Projects published')).toBeInTheDocument();
  });

  it('falls back to initials when the designer has no logo', () => {
    render(<PublicDesignerProfile portfolio={makePublicPortfolio({ logoUrl: null })} />);

    expect(screen.getAllByText('AS').length).toBeGreaterThan(0);
  });

  it('keeps the rating-card shadow visible instead of clipping it into a block', () => {
    render(<PublicDesignerProfile portfolio={makePublicPortfolio()} />);

    const ratingSummary = screen
      .getByText('Based on 42 verified reviews')
      .closest('[data-slot="card"]');

    expect(ratingSummary).toHaveClass('shadow-floating-card');
    expect(ratingSummary?.closest('.pb-20')).toBeInTheDocument();
  });

  it('builds displayed and copied profile links from the API canonical URL', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    render(<PublicDesignerProfile portfolio={makePublicPortfolio()} />);

    expect(screen.getByText('localhost:3000/d/anika-spaces')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));

    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith('http://localhost:3000/d/anika-spaces');
  });

  it('routes service-dependent actions through login gating', () => {
    render(<PublicDesignerProfile portfolio={makePublicPortfolio()} />);

    expect(screen.getByRole('link', { name: 'Start a conversation' })).toHaveAttribute(
      'href',
      '/login?next=%2Fd%2Fanika-spaces',
    );
    screen
      .getAllByRole('link', { name: 'Enquire' })
      .forEach((link) => expect(link).toHaveAttribute('href', '/login?next=%2Fd%2Fanika-spaces'));
    expect(screen.getByRole('link', { name: 'Get free consultation' })).toHaveAttribute(
      'href',
      '/login?next=%2Fd%2Fanika-spaces',
    );
  });

  it('renders the API-supplied project page in the gallery', () => {
    const projects = makeProjects(6);
    render(
      <PublicDesignerProfile
        portfolio={makePublicPortfolio({
          projects: { projects, page: 1, limit: 30, hasMore: false },
        })}
      />,
    );

    expect(within(screen.getByTestId('visible-projects')).getAllByRole('article')).toHaveLength(6);
  });

  it('tells visitors when a designer has published nothing yet', () => {
    render(
      <PublicDesignerProfile
        portfolio={makePublicPortfolio({
          projects: { projects: [], page: 1, limit: 30, hasMore: false },
        })}
      />,
    );

    expect(screen.getByText(/no published projects yet/i)).toBeInTheDocument();
  });
});
