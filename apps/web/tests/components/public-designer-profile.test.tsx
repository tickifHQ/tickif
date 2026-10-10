// @vitest-environment-options {"settings":{"disableIframePageLoading":true}}

import { fireEvent, render, screen, within } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PublicDesignerProfile } from '../../src/components/public-designer-profile';
import { makeProjects, makePublicPortfolio, makeReview } from '../fixtures/public-portfolio';

describe('Figma review corrections', () => {
  it('shows the supplied office count without inferring it from centres', () => {
    const portfolio = makePublicPortfolio();
    render(
      <PublicDesignerProfile
        portfolio={{ ...portfolio, stats: { ...portfolio.stats, officeCount: 4 } }}
      />,
    );
    const hero = within(screen.getByRole('region', { name: 'Portfolio hero' }));
    expect(hero.getByText('Offices')).toBeInTheDocument();
    expect(hero.getByText('4', { exact: true })).toBeInTheDocument();
  });

  it('labels experience centre groups by state and keeps centre selection usable', async () => {
    render(
      <PublicDesignerProfile
        portfolio={makePublicPortfolio({
          experienceCenterGroups: [
            {
              state: 'Tamil Nadu',
              centers: [
                {
                  name: 'Chennai Studio',
                  city: 'Chennai',
                  state: 'Tamil Nadu',
                  address: 'Anna Nagar',
                },
              ],
            },
            {
              state: 'Karnataka',
              centers: [
                {
                  name: 'Bengaluru Studio',
                  city: 'Bengaluru',
                  state: 'Karnataka',
                  address: 'Whitefield',
                },
              ],
            },
          ],
        })}
      />,
    );
    const centres = within(screen.getByRole('region', { name: 'Experience centres' }));
    expect(centres.getByRole('group', { name: 'Tamil Nadu' })).toBeInTheDocument();
    const group = within(centres.getByRole('group', { name: 'Karnataka' }));
    await userEvent.setup().click(group.getByRole('tab', { name: 'Bengaluru Studio' }));
    expect(centres.getByRole('heading', { name: 'Bengaluru Studio' })).toBeInTheDocument();
  });

  it('shows the studio name once across the navigation and hero', () => {
    const portfolio = makePublicPortfolio({ heroCoverUrl: 'https://cdn.example.test/cover.webp' });
    const { container } = render(<PublicDesignerProfile portfolio={portfolio} />);
    const navigation = container.querySelector('.profile-navigation')!;
    expect(navigation).not.toHaveTextContent(portfolio.displayName);
    const hero = screen.getByRole('region', { name: 'Portfolio hero' });
    expect(within(hero).getByRole('heading', { name: portfolio.displayName })).toBeVisible();
    expect(hero.querySelector('.profile-card-name')).toHaveTextContent('Selected work');
    expect(
      within(navigation as HTMLElement).getByRole('link', {
        name: `${portfolio.displayName} portfolio`,
      }),
    ).toHaveAttribute('href', '#profile-top');
  });
  it('shows Google client ratings without source tabs or Tickif review cards', () => {
    render(
      <PublicDesignerProfile
        portfolio={makePublicPortfolio({
          reviews: [
            makeReview({ author: 'Google client' }),
            makeReview({ id: 'tickif-only', source: 'tickif', author: 'Tickif client' }),
          ],
        })}
      />,
    );
    const section = within(screen.getByRole('region', { name: 'Client ratings' }));
    expect(section.queryByRole('tablist')).not.toBeInTheDocument();
    expect(section.getByText('57 Google reviews')).toBeInTheDocument();
    expect(section.queryByText('Tickif client')).not.toBeInTheDocument();
    expect(section.getByRole('region', { name: 'Google client reviews' })).toHaveAttribute(
      'aria-roledescription',
      'carousel',
    );
  });

  it('removes the extra studio section and hero Share action', () => {
    const { container } = render(<PublicDesignerProfile portfolio={makePublicPortfolio()} />);
    expect(container.querySelector('#studio')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Studio' })).not.toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: 'Portfolio hero' })).queryByRole('button', {
        name: 'Share',
      }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Share this card' })).toBeInTheDocument();
  });

  it('uses numbered shared pagination for the review carousel', () => {
    render(
      <PublicDesignerProfile
        portfolio={makePublicPortfolio({
          reviews: [1, 2, 3, 4, 5].map((number) =>
            makeReview({ id: `g-${number}`, author: `Google client ${number}` }),
          ),
        })}
      />,
    );
    const pagination = screen.getByRole('navigation', { name: 'Google review pages' });
    expect(pagination).toHaveAttribute('data-slot', 'pagination');
    expect(within(pagination).getByRole('button', { name: 'Go to review page 1' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    fireEvent.click(within(pagination).getByRole('button', { name: 'Go to review page 3' }));
    expect(within(pagination).getByRole('button', { name: 'Go to review page 3' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(
      within(screen.getByTestId('profile-review-cards')).getByRole('article'),
    ).toHaveTextContent('Google client 5');
  });
});

vi.mock('@/components/project-view-count', () => ({
  ProjectViewCount: () => (
    <span role="img" aria-label="0 project views">
      0
    </span>
  ),
}));
vi.mock('@/components/action-login-dialog', () => ({
  ActionLoginDialog: ({ open }: { open: boolean }) =>
    open ? <div role="dialog" aria-label="Sign in to continue" /> : null,
}));

const mocks = vi.hoisted(() => ({
  session: null as {
    session: { activeOrganizationId: string | null };
    user: { id: string; email: string; phoneNumber: string | null };
  } | null,
  checkEnquiry: vi.fn(async () => ({
    ok: true,
    json: async () => ({
      canEnquire: true,
      unavailableReason: null,
      exists: false,
      enquiryId: null,
    }),
  })),
}));

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    useSession: () => ({ data: mocks.session, isPending: false }),
  },
}));

vi.mock('@/lib/api', () => ({
  api: {
    api: {
      enquiries: {
        check: { $get: mocks.checkEnquiry },
      },
    },
  },
}));

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
  it.each([
    ['#FFFFFF', 'var(--portfolio-accent-on-light)'],
    ['#000000', 'var(--portfolio-accent-on-dark)'],
  ])('keeps buttons readable for custom accent %s', (accentColor, foreground) => {
    const { container } = render(
      <PublicDesignerProfile portfolio={makePublicPortfolio({ accentColor })} />,
    );
    expect(container.querySelector('main')!.style.getPropertyValue('--primary-foreground')).toBe(
      foreground,
    );
    expect(
      container.querySelector('main')!.style.getPropertyValue('--profile-heading-accent'),
    ).toBe('var(--foreground)');
  });

  it('leaves theme tokens intact for an unsafe saved accent', () => {
    const { container } = render(
      <PublicDesignerProfile
        portfolio={makePublicPortfolio({ accentColor: 'url(https://example.test)' })}
      />,
    );
    expect(container.querySelector('main')!.style.getPropertyValue('--primary')).toBe('');
  });

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
    { name: 'Recognition on Tickif' }, // credentials
    { name: /Selected projects/i }, // gallery
    { name: 'Client ratings' }, // reviews
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
  afterEach(() => {
    mocks.session = null;
  });

  it('provides working portfolio navigation and a back-to-top link', () => {
    const { container } = render(<PublicDesignerProfile portfolio={makePublicPortfolio()} />);
    const navigation = within(screen.getByRole('navigation', { name: 'Portfolio sections' }));
    for (const label of ['Work', 'Recognition', 'Reviews']) {
      const href = navigation.getByRole('link', { name: label }).getAttribute('href');
      expect(href).toMatch(/^#/);
      expect(container.querySelector(href!)).toBeInTheDocument();
    }
    expect(screen.getByRole('link', { name: /Back to top/ })).toHaveAttribute(
      'href',
      '#profile-top',
    );
  });

  it('does not link visitors to hidden recognition or unavailable centres', () => {
    const portfolio = makePublicPortfolio();
    render(
      <PublicDesignerProfile
        portfolio={{
          ...portfolio,
          badges: [],
          reviews: [],
          sections: { ...portfolio.sections, reviews: false, overallRating: false },
          reviewVisibility: {
            ...portfolio.reviewVisibility,
            google: { ...portfolio.reviewVisibility.google, reviews: false, overallRating: false },
          },
        }}
      />,
    );
    const navigation = within(screen.getByRole('navigation', { name: 'Portfolio sections' }));
    expect(navigation.queryByRole('link', { name: 'Recognition' })).not.toBeInTheDocument();
    expect(navigation.queryByRole('link', { name: 'Reviews' })).not.toBeInTheDocument();
    expect(navigation.queryByRole('link', { name: 'Centres' })).not.toBeInTheDocument();
  });

  it('composes the hero seals only for earned supported credentials', () => {
    const { container } = render(
      <PublicDesignerProfile
        portfolio={makePublicPortfolio({ badges: ['verified', 'established'] })}
      />,
    );
    const hero = within(screen.getByRole('region', { name: 'Portfolio hero' }));
    expect(hero.getByRole('list', { name: 'Studio recognition' }).children).toHaveLength(2);
    expect(container.querySelector('img[src="/ui/profile/hero-vector.svg"]')).toBeInTheDocument();
    expect(container.querySelector('img[src="/ui/profile/hero-vector3.svg"]')).toBeInTheDocument();
    expect(
      container.querySelector('.profile-seal-established textPath[href$="-bottom"]'),
    ).toHaveTextContent('SINCE 2018');
    expect(
      container.querySelector('img[src="/ui/profile/hero-vector6.svg"]'),
    ).not.toBeInTheDocument();
  });

  it('uses the Tickif logo in the portfolio attribution', () => {
    render(<PublicDesignerProfile portfolio={makePublicPortfolio()} />);
    expect(
      within(screen.getByRole('link', { name: 'Tickif home' })).getByText('Tickif'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Tickif home' }).querySelector('img')).toHaveAttribute(
      'src',
      '/icon.svg',
    );
  });

  it('uses live proof data in the circular text and respects hidden ratings and verification', () => {
    const base = makePublicPortfolio();
    const { container } = render(
      <PublicDesignerProfile
        portfolio={makePublicPortfolio({
          isKycVerified: false,
          foundedYear: 2017,
          cities: ['Bengaluru'],
          stats: { ...base.stats, projectCount: 2 },
          sections: { ...base.sections, overallRating: false, tickifBadge: false },
        })}
      />,
    );
    const orbit = container.querySelector('.profile-identity-orbit');
    expect(orbit).toHaveTextContent('ON TICKIF · 2 PROJECTS');
    expect(orbit).toHaveTextContent('EST 2017 · BENGALURU');
    expect(orbit).not.toHaveTextContent(/VERIFIED|REVIEWS|CHENNAI|28 PROJECTS/);
  });

  it('uses live crown captions for supported earned awards, including New on Tickif', () => {
    const { container } = render(
      <PublicDesignerProfile portfolio={makePublicPortfolio({ badges: ['verified', 'new'] })} />,
    );
    const recognition = screen.getByRole('region', { name: 'Recognition on Tickif' });
    expect(within(recognition).getByText('Identity verified')).toBeVisible();
    expect(within(recognition).getByText('New on Tickif')).toBeVisible();
    expect(within(recognition).getByText('Joined in the last 90 days')).toBeVisible();
    expect(container.querySelectorAll('[data-slot="recognition-badge"]')).toHaveLength(2);
    expect(within(recognition).queryByText('Client favourite')).not.toBeInTheDocument();
    expect(within(recognition).queryByText('Fast reply')).not.toBeInTheDocument();
  });

  it('shows published rating, founding year and starting budget in the hero proof grid', () => {
    render(<PublicDesignerProfile portfolio={makePublicPortfolio()} />);
    const hero = within(screen.getByRole('region', { name: 'Portfolio hero' }));
    expect(hero.getByText('Rating')).toBeVisible();
    expect(hero.getByText('42 Tickif reviews')).toBeVisible();
    expect(hero.getByText('Established')).toBeVisible();
    expect(hero.getByText('Starting at')).toBeVisible();
    expect(hero.getByText('Typical budget')).toBeVisible();
  });

  it('omits hero and identity-card ratings when the overall rating is hidden', () => {
    const portfolio = makePublicPortfolio();
    render(
      <PublicDesignerProfile
        portfolio={{ ...portfolio, sections: { ...portfolio.sections, overallRating: false } }}
      />,
    );
    const hero = within(screen.getByRole('region', { name: 'Portfolio hero' }));
    expect(hero.queryByText('Rating')).not.toBeInTheDocument();
    expect(hero.queryByText(/verified reviews/)).not.toBeInTheDocument();
    expect(hero.queryByText('4.7', { exact: true })).not.toBeInTheDocument();
  });

  it('keeps identity and primary actions together in the hero without a duplicate studio bar', () => {
    render(<PublicDesignerProfile portfolio={makePublicPortfolio()} />);

    const hero = screen.getByRole('region', { name: 'Portfolio hero' });
    expect(within(hero).getByRole('heading', { name: 'Anika Spaces', level: 1 })).toBeVisible();
    expect(within(hero).getByRole('button', { name: 'Enquire' })).toBeVisible();
    expect(within(hero).queryByRole('button', { name: 'Share' })).not.toBeInTheDocument();
    expect(within(hero).getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('retains a primary studio heading and enquiry action when the hero is hidden', () => {
    const portfolio = makePublicPortfolio();
    render(
      <PublicDesignerProfile
        portfolio={{ ...portfolio, sections: { ...portfolio.sections, hero: false } }}
      />,
    );

    expect(screen.queryByRole('region', { name: 'Portfolio hero' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Anika Spaces/, level: 1 })).toBeVisible();
    expect(screen.getAllByRole('button', { name: 'Send enquiry' })[0]).toBeVisible();
    expect(screen.getByRole('button', { name: 'Share' })).toBeVisible();
  });

  it('respects disabled sharing in the hero action group', () => {
    const portfolio = makePublicPortfolio();
    render(
      <PublicDesignerProfile
        portfolio={{ ...portfolio, sections: { ...portfolio.sections, shareBlock: false } }}
      />,
    );
    expect(
      within(screen.getByRole('region', { name: 'Portfolio hero' })).queryByRole('button', {
        name: 'Share',
      }),
    ).not.toBeInTheDocument();
  });

  it('uses the dedicated portfolio cover instead of a project image', () => {
    const portfolio = makePublicPortfolio({
      heroCoverUrl: 'https://cdn.example.test/portfolio-covers/hero.webp',
      projects: {
        projects: makeProjects(1),
        page: 1,
        limit: 30,
        hasMore: false,
      },
    });

    render(<PublicDesignerProfile portfolio={portfolio} />);

    expect(screen.getByAltText('Anika Spaces portfolio cover')).toHaveAttribute(
      'src',
      'https://cdn.example.test/portfolio-covers/hero.webp',
    );
    expect(screen.getByAltText('Anika Spaces portfolio cover')).toHaveAttribute('loading', 'eager');
    expect(screen.getByAltText('Project 0 by Anika Spaces')).toHaveAttribute(
      'src',
      expect.stringContaining('projects/adyar.jpg'),
    );
  });

  it('uses the published founding year and keeps experience as supporting proof', () => {
    render(<PublicDesignerProfile portfolio={makePublicPortfolio()} />);

    const hero = within(screen.getByRole('region', { name: 'Portfolio hero' }));
    expect(hero.getByText('Established')).toBeInTheDocument();
    expect(hero.getByText('8 years experience')).toBeInTheDocument();
    expect(hero.getByText('Projects')).toBeInTheDocument();
    expect(hero.getByText('Typical budget')).toBeInTheDocument();
    expect(hero.getByText('Rating')).toBeInTheDocument();
  });

  it('uses enquiry copy instead of consultation or conversation copy', () => {
    render(<PublicDesignerProfile portfolio={makePublicPortfolio()} />);

    expect(screen.getAllByText('Send enquiry').length).toBeGreaterThan(0);
    expect(screen.queryAllByText(/consultation/i)).toHaveLength(0);
    expect(screen.queryAllByText(/Start a conversation/i)).toHaveLength(0);
  });

  it('renders every section from the API payload', async () => {
    render(<PublicDesignerProfile portfolio={makePublicPortfolio()} />);

    expect(screen.getByRole('heading', { name: 'Anika Spaces', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Recognition on Tickif' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Selected projects/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Client note' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Client ratings' })).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Anika Spaces', level: 2 }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /A portfolio worth sharing/i })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        name: "Let's build something you can't imagine living without.",
      }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: 'Portfolio hero' })).getByText('28'),
    ).toBeInTheDocument();
  });

  it('renders only the badges the API awarded, not the full badge set', () => {
    render(
      <PublicDesignerProfile
        portfolio={makePublicPortfolio({ badges: ['verified', 'top-performer'] })}
      />,
    );

    const recognition = within(screen.getByRole('region', { name: 'Recognition on Tickif' }));
    expect(recognition.getByText('Identity verified')).toBeInTheDocument();
    expect(recognition.getByText('Top performer')).toBeInTheDocument();
    expect(recognition.queryByText('New on Tickif')).not.toBeInTheDocument();
    expect(recognition.queryByText('Established studio')).not.toBeInTheDocument();
    expect(recognition.queryByText('Projects published')).not.toBeInTheDocument();
  });

  it('never presents the studio as verified before current KYC approval', () => {
    const { container } = render(
      <PublicDesignerProfile
        portfolio={makePublicPortfolio({
          badges: ['new', 'projects-published'],
          isKycVerified: false,
          sections: {
            ...makePublicPortfolio().sections,
            tickifBadge: true,
          },
        })}
      />,
    );

    expect(screen.queryByLabelText('Verified studio')).not.toBeInTheDocument();
    expect(screen.queryByText('KYC verified')).not.toBeInTheDocument();
    expect(within(container).queryByAltText('Identity verified')).not.toBeInTheDocument();
  });

  it('shows studio verification marks after current KYC approval', () => {
    render(<PublicDesignerProfile portfolio={makePublicPortfolio()} />);

    expect(screen.getAllByLabelText('Verified studio')).toHaveLength(2);
    expect(screen.getByText('KYC verified')).toBeInTheDocument();
  });

  it('respects the hidden Tickif badge setting in identity and sharing tickets', () => {
    const base = makePublicPortfolio();
    render(
      <PublicDesignerProfile
        portfolio={{ ...base, sections: { ...base.sections, tickifBadge: false } }}
      />,
    );
    expect(screen.queryByText('KYC verified')).not.toBeInTheDocument();
    expect(screen.queryByText('Verified', { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Verified studio')).not.toBeInTheDocument();
  });

  it('limits client review pages to two cards while keeping every review reachable', () => {
    const reviews = [
      makeReview({ id: 'r1', author: 'Rahul S.' }),
      makeReview({ id: 'r2', author: 'Meera & Karthik', rating: 5 }),
      makeReview({ id: 'r3', author: 'Third homeowner' }),
    ];
    render(<PublicDesignerProfile portfolio={makePublicPortfolio({ reviews })} />);

    const primaryReviews = within(screen.getByTestId('profile-review-cards'));
    const reviewCards = primaryReviews.getAllByRole('article');

    expect(reviewCards).toHaveLength(2);
    expect(within(reviewCards[0]!).getByText('Rahul S.')).toBeInTheDocument();
    expect(screen.getAllByText('Rahul S.')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Go to review page 2' }));
    expect(within(screen.getByTestId('profile-review-cards')).getAllByRole('article')).toHaveLength(
      1,
    );
    expect(screen.getByText('Third homeowner')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Go to review page 1' }));
    expect(screen.getByText('Rahul S.')).toBeInTheDocument();
  });

  it('keeps an explicitly requested consultation review outside the Google section', async () => {
    const user = userEvent.setup();
    render(
      <PublicDesignerProfile
        portfolio={makePublicPortfolio()}
        tickifReviews={<input aria-label="Review draft" />}
      />,
    );
    await user.type(screen.getByLabelText('Review draft'), 'My review in progress');
    expect(screen.getByLabelText('Review draft')).toHaveValue('My review in progress');
    expect(
      within(screen.getByRole('region', { name: 'Client ratings' })).queryByLabelText(
        'Review draft',
      ),
    ).not.toBeInTheDocument();
  });

  it('omits ratings and client voices when neither ratings nor reviews exist', () => {
    const portfolio = makePublicPortfolio();
    render(
      <PublicDesignerProfile
        portfolio={{
          ...portfolio,
          reviews: [],
          stats: { ...portfolio.stats, tickif: null, google: null },
        }}
      />,
    );

    expect(screen.queryByTestId('profile-review-cards')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Client ratings' })).not.toBeInTheDocument();
  });

  it('omits unknown experience and offices without creating a false zero metric', () => {
    const portfolio = makePublicPortfolio();
    render(
      <PublicDesignerProfile
        portfolio={{
          ...portfolio,
          stats: { ...portfolio.stats, yearsExperience: null, officeCount: null },
        }}
      />,
    );
    const hero = within(screen.getByRole('region', { name: 'Portfolio hero' }));
    expect(hero.queryByText('Years experience')).not.toBeInTheDocument();
    expect(screen.queryByText('Offices', { exact: true })).not.toBeInTheDocument();
    expect(hero.getByText('Projects', { exact: true })).toBeInTheDocument();
    expect(hero.getByText('Established', { exact: true })).toBeInTheDocument();
    expect(hero.queryByText(/years experience/)).not.toBeInTheDocument();
  });

  it('preserves explicitly supplied zero experience and office count', () => {
    const portfolio = makePublicPortfolio();
    render(
      <PublicDesignerProfile
        portfolio={{
          ...portfolio,
          stats: { ...portfolio.stats, yearsExperience: 0, officeCount: 0 },
        }}
      />,
    );
    const hero = within(screen.getByRole('region', { name: 'Portfolio hero' }));
    expect(hero.getByText('0 years experience')).toBeInTheDocument();
    expect(screen.queryByText('Offices', { exact: true })).not.toBeInTheDocument();
  });

  it('omits the selected projects section when the public portfolio has no projects', () => {
    const portfolio = makePublicPortfolio();
    render(
      <PublicDesignerProfile
        portfolio={{
          ...portfolio,
          stats: { ...portfolio.stats, projectCount: 0 },
          projects: { ...portfolio.projects, projects: [], hasMore: false },
        }}
      />,
    );

    expect(screen.queryByRole('heading', { name: /Selected projects/i })).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: portfolio.displayName, level: 1 }),
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

    expect(
      within(screen.getByRole('region', { name: 'Client ratings' })).getByText('57 Google reviews'),
    ).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Google client reviews' })).toBeInTheDocument();
    expect(screen.queryByText('Based on 0 verified reviews')).not.toBeInTheDocument();
  });

  it('uses only the Google aggregate and labels partial distribution data', () => {
    render(<PublicDesignerProfile portfolio={makePublicPortfolio()} />);
    const section = within(screen.getByRole('region', { name: 'Client ratings' }));
    expect(section.getByText('57 Google reviews')).toBeInTheDocument();
    expect(section.queryByText(/42 Tickif reviews/)).not.toBeInTheDocument();
    expect(section.getByText('Distribution of 1 available Google reviews')).toBeInTheDocument();
    expect(section.getByRole('meter', { name: '5 star reviews' })).toHaveAttribute(
      'aria-valuemax',
      '1',
    );
  });

  it('supports rating-only Google reviews without a verified-consultation marker', () => {
    render(
      <PublicDesignerProfile
        portfolio={makePublicPortfolio({ reviews: [makeReview({ text: null })] })}
      />,
    );
    const reviews = within(screen.getByTestId('profile-review-cards'));
    expect(reviews.getByText('Rating only')).toBeInTheDocument();
    expect(reviews.queryByLabelText('Verified client')).not.toBeInTheDocument();
    expect(screen.queryByText('“”')).not.toBeInTheDocument();
  });

  it('hides sections the designer switched off in portfolio settings', () => {
    const portfolio = makePublicPortfolio();
    render(
      <PublicDesignerProfile
        portfolio={{
          ...portfolio,
          reviewVisibility: {
            ...portfolio.reviewVisibility,
            google: { reviews: false, overallRating: false },
          },
          sections: {
            ...portfolio.sections,
            trustCredentials: false,
            featuredTestimonial: false,
            reviews: false,
            overallRating: false,
            shareBlock: false,
          },
        }}
      />,
    );

    expect(
      screen.queryByRole('heading', { name: 'Recognition on Tickif' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Client note' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Client ratings' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: /A portfolio worth sharing/i }),
    ).not.toBeInTheDocument();
    // The extra Studio section is intentionally absent from the Figma layout.
    expect(
      screen.queryByRole('heading', { name: 'Anika Spaces', level: 2 }),
    ).not.toBeInTheDocument();
  });

  it('keeps the Google rating summary when both review lists are disabled', () => {
    const portfolio = makePublicPortfolio();
    render(
      <PublicDesignerProfile
        portfolio={{
          ...portfolio,
          sections: { ...portfolio.sections, reviews: false },
          reviewVisibility: {
            ...portfolio.reviewVisibility,
            google: { ...portfolio.reviewVisibility.google, reviews: false, overallRating: true },
          },
          reviews: [],
        }}
      />,
    );
    expect(screen.getByRole('region', { name: 'Client ratings' })).toBeInTheDocument();
    expect(screen.getByText('57 Google reviews')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Google client reviews' })).not.toBeInTheDocument();
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

  it('retains studio identity in the hero and real social links in the footer', () => {
    render(<PublicDesignerProfile portfolio={makePublicPortfolio()} />);
    const hero = within(screen.getByRole('region', { name: 'Portfolio hero' }));
    expect(hero.getByRole('heading', { name: 'Anika Spaces', level: 1 })).toBeVisible();
    expect(hero.getByText('2018')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Instagram' })).toHaveAttribute(
      'href',
      'https://www.instagram.com/anika',
    );
    expect(screen.getByRole('link', { name: 'LinkedIn' })).toHaveAttribute(
      'href',
      'https://www.linkedin.com/in/anika',
    );
    expect(screen.getByRole('link', { name: 'anikaspaces.in' })).toHaveAttribute(
      'href',
      'https://anikaspaces.in/',
    );
    for (const label of ['Instagram', 'LinkedIn', 'anikaspaces.in']) {
      expect(screen.getByRole('link', { name: label })).toHaveAttribute(
        'rel',
        'noopener noreferrer nofollow',
      );
    }
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
            cityPresenceCount: 0,
            startingBudget: null,
          },
        })}
      />,
    );

    expect(screen.queryByText('Established')).not.toBeInTheDocument();
    expect(screen.queryByText('Typical budget')).not.toBeInTheDocument();
    expect(screen.queryByText('anikaspaces.in')).not.toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: 'Portfolio hero' })).getByText('Projects'),
    ).toBeInTheDocument();
  });

  it('switches the selected experience center and keeps its public details together', async () => {
    render(
      <PublicDesignerProfile
        portfolio={makePublicPortfolio({
          experienceCenterGroups: [
            {
              state: 'Karnataka',
              centers: [
                {
                  name: 'Whitefield Experience Center',
                  address: '12, 1st Main Road, Whitefield',
                  city: 'Bengaluru',
                  state: 'Karnataka',
                  postalCode: '560066',
                  phone: '+91 99946-45911',
                  mapsUrl: 'https://maps.google.com/?q=Whitefield',
                },
              ],
            },
            {
              state: 'Maharashtra',
              centers: [
                {
                  name: 'Powai Studio',
                  address: '4, Hiranandani Gardens, Powai',
                  city: 'Mumbai',
                  state: 'Maharashtra',
                  postalCode: null,
                  phone: null,
                  mapsUrl: null,
                },
              ],
            },
          ],
        })}
      />,
    );

    const section = screen.getByRole('region', { name: 'Experience centres' });
    const centers = within(section);
    const cards = section.querySelectorAll('[data-slot="experience-center-card"]');
    expect(cards).toHaveLength(1);
    expect(
      centers.getByRole('heading', { name: 'Whitefield Experience Center', level: 3 }),
    ).toBeInTheDocument();
    expect(
      centers.queryByRole('heading', { name: 'Powai Studio', level: 3 }),
    ).not.toBeInTheDocument();
    expect(centers.getByText('Bengaluru, Karnataka · 560066')).toBeInTheDocument();
    expect(centers.getByTitle('Google Maps — Whitefield Experience Center')).toBeInTheDocument();
    expect(centers.getAllByText('12, 1st Main Road, Whitefield').length).toBeGreaterThan(0);
    expect(centers.getByRole('link', { name: '+91 99946-45911' })).toHaveAttribute(
      'href',
      'tel:+919994645911',
    );
    expect(centers.getByRole('link', { name: 'Open in Maps' })).toHaveAttribute(
      'href',
      'https://maps.google.com/?q=Whitefield',
    );
    expect(centers.getByRole('link', { name: 'Open in Maps' })).toHaveAttribute(
      'rel',
      'noopener noreferrer nofollow',
    );
    await userEvent.setup().click(centers.getByRole('tab', { name: 'Powai Studio' }));
    expect(centers.getByRole('heading', { name: 'Powai Studio', level: 3 })).toBeInTheDocument();
    const map = centers.getByTitle('Google Maps — Powai Studio');
    expect(new URL(map.getAttribute('src')!).searchParams.get('q')).toBe(
      '4, Hiranandani Gardens, Powai, Mumbai, Maharashtra',
    );
    expect(centers.getAllByText('4, Hiranandani Gardens, Powai').length).toBeGreaterThan(0);
    expect(centers.queryByRole('link', { name: 'Open in Maps' })).not.toBeInTheDocument();
  });

  it('embeds a shared Google map while retaining a full Maps navigation link', () => {
    const mapsUrl = 'https://www.google.com/maps/embed?pb=!1m18!2sWhitefield';
    const container = document.createElement('div');
    // Keep external iframe loading out of this server-markup regression.
    container.innerHTML = renderToStaticMarkup(
      <PublicDesignerProfile
        portfolio={makePublicPortfolio({
          experienceCenterGroups: [
            {
              state: 'Karnataka',
              centers: [
                {
                  name: 'Whitefield Studio',
                  address: 'Whitefield',
                  city: 'Bengaluru',
                  state: 'Karnataka',
                  mapsUrl,
                },
              ],
            },
          ],
        })}
      />,
    );
    const section = container.querySelector('#centres');
    expect(section?.querySelector('h2')).toHaveTextContent('Experience centres');
    expect(section?.querySelector('iframe')).toHaveAttribute(
      'title',
      'Google Maps — Whitefield Studio',
    );
    expect(section?.querySelector('iframe')).toHaveAttribute('src', mapsUrl);
    const link = section?.querySelector('a');
    expect(link).toHaveTextContent('Open in Maps');
    const destination = new URL(link!.getAttribute('href')!);
    expect(destination.origin).toBe('https://www.google.com');
    expect(destination.pathname).toBe('/maps/search/');
    expect(destination.searchParams.get('query')).toBe('Whitefield, Bengaluru, Karnataka');
  });

  it('omits the experience centers section when data is absent or all groups are empty', () => {
    const { rerender } = render(
      <PublicDesignerProfile
        portfolio={makePublicPortfolio({ experienceCenterGroups: undefined })}
      />,
    );
    expect(screen.queryByRole('region', { name: 'Experience centres' })).not.toBeInTheDocument();

    rerender(
      <PublicDesignerProfile
        portfolio={makePublicPortfolio({
          experienceCenterGroups: [{ state: 'Karnataka', centers: [] }],
        })}
      />,
    );
    expect(screen.queryByRole('region', { name: 'Experience centres' })).not.toBeInTheDocument();
  });

  it('omits unavailable contact actions and refuses unsafe map schemes', () => {
    render(
      <PublicDesignerProfile
        portfolio={makePublicPortfolio({
          experienceCenterGroups: [
            {
              state: 'Karnataka',
              centers: [
                {
                  name: 'Safe Studio',
                  address: 'A very long address that must remain readable on narrow screens',
                  city: 'Bengaluru',
                  state: 'Karnataka',
                  postalCode: null,
                  phone: null,
                  mapsUrl: 'javascript:alert(1)',
                },
              ],
            },
          ],
        })}
      />,
    );

    const section = screen.getByRole('region', { name: 'Experience centres' });
    expect(within(section).queryByRole('link')).not.toBeInTheDocument();
    expect(within(section).getAllByText('Bengaluru, Karnataka').length).toBeGreaterThan(0);
  });

  it('falls back to initials when the designer has no logo', () => {
    render(<PublicDesignerProfile portfolio={makePublicPortfolio({ logoUrl: null })} />);

    expect(screen.getAllByText('AS').length).toBeGreaterThan(0);
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

  it('opens login in place for signed-out profile actions', () => {
    render(<PublicDesignerProfile portfolio={makePublicPortfolio()} />);

    expect(screen.getAllByRole('button', { name: 'Send enquiry' })).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Enquire' })).toBeEnabled();
    fireEvent.click(screen.getAllByRole('button', { name: 'Send enquiry' })[0]!);
    expect(screen.getByRole('dialog', { name: 'Sign in to continue' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Save profile' })).not.toBeInTheDocument();
  });

  it('renders enquiry actions as in-page controls for a signed-in visitor', () => {
    mocks.session = {
      session: { activeOrganizationId: null },
      user: {
        id: 'visitor-1',
        email: 'homeowner@example.com',
        phoneNumber: '+919876543210',
      },
    };

    render(<PublicDesignerProfile portfolio={makePublicPortfolio()} />);

    expect(screen.getAllByRole('button', { name: 'Send enquiry' })).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Enquire' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Send enquiry' })).not.toBeInTheDocument();
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

  it('does not show an empty project gallery to visitors', () => {
    const portfolio = makePublicPortfolio();
    render(
      <PublicDesignerProfile
        portfolio={{
          ...portfolio,
          stats: { ...portfolio.stats, projectCount: 0 },
          projects: { projects: [], page: 1, limit: 30, hasMore: false },
        }}
      />,
    );

    expect(screen.queryByRole('heading', { name: /Selected projects/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/no published projects yet/i)).not.toBeInTheDocument();
  });
});

/**
 * E-212 #4: the hero "Verified" chip and the story-card "KYC verified" line are
 * independent trust signals. Turning off the Trust & Credentials section makes
 * the API send `badges: []`, but a KYC-verified designer must keep those two
 * signals — they now read the dedicated `isKycVerified` field, not the
 * section-gated badge array.
 */
describe('PublicDesignerProfile — KYC signals independent of Trust & Credentials section (E-212 #4)', () => {
  /** Trust section OFF => API returns badges: [] (mirrors public-portfolio-service). */
  function trustOffButVerified() {
    const base = makePublicPortfolio();
    return {
      ...base,
      isKycVerified: true,
      badges: [],
      sections: { ...base.sections, trustCredentials: false },
    };
  }

  it('keeps the hero Verified chip and story KYC line when Trust & Credentials is off', () => {
    render(<PublicDesignerProfile portfolio={trustOffButVerified()} />);

    // Hiding recognition does not hide the independently controlled KYC signal.
    expect(
      screen.queryByRole('heading', { name: 'Recognition on Tickif' }),
    ).not.toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: 'Portfolio hero' })).getByText('Verified studio'),
    ).toBeInTheDocument();
    // Story-card independent KYC line.
    expect(screen.getByText('KYC verified')).toBeInTheDocument();
    // The tickif verified tick (gated by sections.tickifBadge && isKycVerified) also remains.
    expect(screen.getAllByLabelText('Verified studio').length).toBeGreaterThan(0);
  });

  it('keeps the Trust & Credentials section and the KYC signals when it is on', () => {
    render(<PublicDesignerProfile portfolio={makePublicPortfolio()} />);

    expect(screen.getByRole('heading', { name: 'Recognition on Tickif' })).toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: 'Portfolio hero' })).getByText('Verified studio'),
    ).toBeInTheDocument();
    expect(screen.getByText('KYC verified')).toBeInTheDocument();
  });

  it('shows no KYC signals when the designer is not verified, even with the section on', () => {
    render(
      <PublicDesignerProfile
        portfolio={makePublicPortfolio({ isKycVerified: false, badges: ['new'] })}
      />,
    );

    expect(screen.queryByText('KYC verified')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Verified studio')).not.toBeInTheDocument();
  });
});

/**
 * E-212 #14: the bio must not render more than twice — the hero strapline
 * fallback and the Studio details "about" copy. It was previously also rendered
 * in the Portfolio section, producing up to three copies.
 */
describe('PublicDesignerProfile — bio is not duplicated across sections (E-212 #14)', () => {
  it('renders the bio at most twice (hero fallback + studio details), not in the Portfolio section', () => {
    const bio = 'A boutique residential design studio led by Anika Subramanian.';
    // With a tagline present, the hero uses the tagline (not the bio), so the
    // bio appears exactly once — in Studio details.
    render(<PublicDesignerProfile portfolio={makePublicPortfolio({ bio })} />);

    expect(screen.queryAllByText(bio)).toHaveLength(0);
  });

  it('shows the bio at most twice when it is also the hero fallback (no tagline)', () => {
    const bio = 'A boutique residential design studio led by Anika Subramanian.';
    render(<PublicDesignerProfile portfolio={makePublicPortfolio({ bio, tagline: null })} />);

    // Hero strapline fallback + Studio details = 2; never 3 (Portfolio section removed).
    expect(screen.getAllByText(bio).length).toBeLessThanOrEqual(2);
  });
});

/**
 * E-304: profile sections must not render their wrapper/heading when they have
 * no meaningful data. Each affected section self-guards (early return null),
 * matching the established Portfolio/Story/Reviews pattern.
 */
describe('PublicDesignerProfile — hides empty sections (E-304)', () => {
  it('renders every affected section heading when the data is populated', () => {
    // Baseline: the default fixture has badges, a testimonial, projects and reviews.
    render(<PublicDesignerProfile portfolio={makePublicPortfolio()} />);

    expect(screen.getByRole('heading', { name: 'Recognition on Tickif' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Selected projects/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Client note' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Client ratings' })).toBeInTheDocument();
  });

  it('hides the Credentials section (wrapper + heading) when there are no badges, even with the section enabled', () => {
    const portfolio = makePublicPortfolio();
    render(
      <PublicDesignerProfile
        portfolio={{
          ...portfolio,
          badges: [],
          sections: { ...portfolio.sections, trustCredentials: true },
        }}
      />,
    );

    expect(
      screen.queryByRole('heading', { name: 'Recognition on Tickif' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Earned through real work')).not.toBeInTheDocument();
  });

  it('hides the Story section (wrapper + heading) when there is no testimonial, even with the section enabled', () => {
    const portfolio = makePublicPortfolio();
    render(
      <PublicDesignerProfile
        portfolio={{
          ...portfolio,
          testimonial: null,
          sections: { ...portfolio.sections, featuredTestimonial: true },
        }}
      />,
    );

    expect(screen.queryByRole('region', { name: 'Client note' })).not.toBeInTheDocument();
  });

  it('hides the Reviews section heading when there are neither ratings nor reviews', () => {
    const portfolio = makePublicPortfolio();
    render(
      <PublicDesignerProfile
        portfolio={{
          ...portfolio,
          reviews: [],
          stats: { ...portfolio.stats, tickif: null, google: null },
        }}
      />,
    );

    expect(screen.queryByRole('heading', { name: 'Client ratings' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('profile-review-cards')).not.toBeInTheDocument();
  });

  it('hides the Portfolio section heading when there are no published projects', () => {
    const portfolio = makePublicPortfolio();
    render(
      <PublicDesignerProfile
        portfolio={{
          ...portfolio,
          stats: { ...portfolio.stats, projectCount: 0 },
          projects: { ...portfolio.projects, projects: [], hasMore: false },
        }}
      />,
    );

    expect(screen.queryByRole('heading', { name: /Selected projects/i })).not.toBeInTheDocument();
  });
});
