import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PublicDesignerProfile } from '../../src/components/public-designer-profile';
import { makeProjects, makePublicPortfolio, makeReview } from '../fixtures/public-portfolio';

/**
 * Bug Condition Exploration Test
 *
 * Validates: Requirements 1.1, 1.2
 *
 * Property 1: Bug Condition — Accent colour not applied to component tree
 *
 * When `PublicDesignerProfile` receives a portfolio with a valid `accentColor`,
 * the `<main>` element SHOULD have an inline style setting `--primary` to that
 * accent colour value. This test encodes the expected (correct) behavior.
 *
 * On UNFIXED code this test is EXPECTED TO FAIL, confirming the bug exists:
 * the `<main>` element does not have inline style `--primary`; accent colour is ignored.
 */
describe('PublicDesignerProfile — accent colour bug condition', () => {
  it('applies portfolio.accentColor as --primary CSS variable on <main>', () => {
    const portfolio = makePublicPortfolio({ accentColor: '#4A90D9' });

    const { container } = render(<PublicDesignerProfile portfolio={portfolio} />);

    const mainElement = container.querySelector('main');
    expect(mainElement).not.toBeNull();

    const styleAttr = mainElement!.getAttribute('style') ?? '';
    expect(
      styleAttr,
      'The <main> element does not have inline style --primary; accent colour is ignored',
    ).toContain('--primary: #4A90D9');
  });
});

/**
 * Preservation Property Tests
 *
 * Validates: Requirements 3.1, 3.2, 3.4
 *
 * Property 2: Preservation — Existing sections and layout unchanged
 *
 * These tests confirm that all key page sections (hero, credentials, gallery,
 * reviews, studio details, share block, consultation CTA) render correctly
 * regardless of the accent colour value. Layout is not affected by accent.
 *
 * On UNFIXED code these tests are EXPECTED TO PASS — they verify the baseline
 * behaviour that must be preserved when the accent colour fix is applied.
 */
describe('PublicDesignerProfile — preservation (sections render regardless of accent)', () => {
  const keyHeadings = [
    { name: 'Anika Spaces', level: 1 as const }, // hero
    { name: 'Verified on Tickif' }, // credentials
    { name: /Selected projects/i }, // gallery
    { name: /their words/i }, // story / testimonial
    { name: "What it\u2019s like to work with us." }, // reviews
    { name: 'Anika Spaces', level: 2 as const }, // studio details
    { name: /A portfolio worth sharing/i }, // share block
    { name: "Let's build something you can't imagine living without." }, // CTA
  ];

  it('renders all key sections with default accent (#FF8F73)', () => {
    const portfolio = makePublicPortfolio({ accentColor: '#FF8F73' });
    render(<PublicDesignerProfile portfolio={portfolio} />);

    for (const heading of keyHeadings) {
      expect(
        screen.getByRole('heading', heading),
        `Section heading "${String(heading.name)}" should be present with default accent`,
      ).toBeInTheDocument();
    }
  });

  it('renders all key sections with non-default accent (#4A90D9) — layout unaffected', () => {
    const portfolio = makePublicPortfolio({ accentColor: '#4A90D9' });
    render(<PublicDesignerProfile portfolio={portfolio} />);

    for (const heading of keyHeadings) {
      expect(
        screen.getByRole('heading', heading),
        `Section heading "${String(heading.name)}" should be present with non-default accent`,
      ).toBeInTheDocument();
    }
  });
});

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
        portfolio={makePublicPortfolio({ reviews: [], reviewSource: null })}
      />,
    );

    expect(screen.queryByTestId('review-marquee')).not.toBeInTheDocument();
    expect(
      screen.getByText('Anika Spaces hasn’t collected reviews on Tickif yet.'),
    ).toBeInTheDocument();
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
            rating: 0,
            reviewCount: 0,
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
    expect(ratingSummary?.parentElement).toHaveClass('pb-20');
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
