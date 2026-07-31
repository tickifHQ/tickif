import { createElement } from 'react';
import type { ComponentProps } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PortfolioResponse } from '@repo/contracts';
import { DesignerPortfolioSettings } from '../../src/components/designer-portfolio-settings';

const mock = vi.hoisted(() => ({
  fetchPortfolio: vi.fn(),
  updatePortfolio: vi.fn(),
  checkSlugAvailability: vi.fn(),
  uploadLogo: vi.fn(),
  deleteLogo: vi.fn(),
  fetchGoogleReviews: vi.fn(),
  connectGoogleReviews: vi.fn(),
  refreshGoogleReviews: vi.fn(),
  disconnectGoogleReviews: vi.fn(),
}));

vi.mock('@/lib/portfolio-api', () => ({
  fetchPortfolio: mock.fetchPortfolio,
  updatePortfolio: mock.updatePortfolio,
  checkSlugAvailability: mock.checkSlugAvailability,
  uploadLogo: mock.uploadLogo,
  deleteLogo: mock.deleteLogo,
  fetchGoogleReviews: mock.fetchGoogleReviews,
  connectGoogleReviews: mock.connectGoogleReviews,
  refreshGoogleReviews: mock.refreshGoogleReviews,
  disconnectGoogleReviews: mock.disconnectGoogleReviews,
}));

vi.mock('next/image', () => ({
  default: ({
    fill: _fill,
    unoptimized: _unoptimized,
    ...imageProps
  }: ComponentProps<'img'> & { fill?: boolean; unoptimized?: boolean }) =>
    createElement('img', imageProps),
}));

const basePortfolio: PortfolioResponse = {
  id: '11111111-1111-4111-8111-111111111111',
  publicLinkEnabled: true,
  portfolioSlug: 'mahi-studio',
  accentColor: '#FF8F73',
  showHero: true,
  showTrustCredentials: true,
  showFeaturedTestimonial: true,
  showReviews: true,
  showSocialLinks: true,
  showShareBlock: true,
  tagline: 'Design with care',
  displayName: 'Mahi Studio',
  bio: 'Interiors for real life.',
  logoUrl: null,
  websiteUrl: 'https://mahistudio.com',
  instagramHandle: '@mahistudio',
  linkedinHandle: '/company/mahistudio',
  youtubeHandle: '@mahistudio',
  testimonialWords: 'Loved working with them.',
  testimonialAuthor: 'Priya K',
  testimonialProjectId: null,
  showOverallRating: true,
  showPositiveReviewsOnly: false,
  showTickifBadge: true,
  badges: ['verified'],
  portfolioUrl: 'https://tickif.com/d/mahi-studio',
  publiclyVisible: true,
  missingRequiredFields: [],
  googleConnection: null,
  publishedAt: null,
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
};

const NOT_CONNECTED_GOOGLE = { available: true, connection: null, reviews: [] };

// The E-195 design uses visually-styled labels that aren't associated with
// their inputs via htmlFor, so we target inputs by their placeholder text.
const SLUG_PLACEHOLDER = 'your-studio';
const STUDIO_NAME_PLACEHOLDER = 'Your studio name';
const TAGLINE_PLACEHOLDER = 'A short tagline for your portfolio';
const BIO_PLACEHOLDER = 'Tell visitors about your design philosophy...';

async function renderSettings() {
  render(<DesignerPortfolioSettings />);
  return await screen.findByPlaceholderText(SLUG_PLACEHOLDER);
}

describe('DesignerPortfolioSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.fetchPortfolio.mockResolvedValue(basePortfolio);
    mock.fetchGoogleReviews.mockResolvedValue(NOT_CONNECTED_GOOGLE);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the fetched portfolio data', async () => {
    const slugInput = await renderSettings();

    expect(slugInput).toHaveValue('mahi-studio');
    expect(screen.getByPlaceholderText(STUDIO_NAME_PLACEHOLDER)).toHaveValue('Mahi Studio');
    expect(screen.getByPlaceholderText(TAGLINE_PLACEHOLDER)).toHaveValue('Design with care');
    expect(screen.getByPlaceholderText(BIO_PLACEHOLDER)).toHaveValue('Interiors for real life.');
    expect(screen.getByText('https://tickif.com/d/mahi-studio')).toBeInTheDocument();
  });

  it('tells the designer which hero fields still block the public page', async () => {
    mock.fetchPortfolio.mockResolvedValueOnce({
      ...basePortfolio,
      publiclyVisible: false,
      missingRequiredFields: ['logo', 'bio'],
    });
    await renderSettings();

    const notice = await screen.findByRole('status');
    expect(notice).toHaveTextContent("Your portfolio isn't public yet.");
    expect(notice).toHaveTextContent('a logo and a bio');
  });

  it('drops the visibility notice once every required field is filled', async () => {
    await renderSettings();

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('copies the canonical preview URL when the backend portfolio URL is not available yet', async () => {
    mock.fetchPortfolio.mockResolvedValueOnce({ ...basePortfolio, portfolioUrl: null });
    await renderSettings();

    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    await user.click(screen.getByRole('button', { name: 'Copy link' }));

    expect(writeText).toHaveBeenCalledWith('http://localhost:3000/d/mahi-studio');
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument();
  });

  it('disables the full portfolio control while the public page is unavailable', async () => {
    await renderSettings();

    expect(screen.getByRole('button', { name: 'Open full' })).toBeDisabled();
    expect(screen.queryByRole('link', { name: 'Open full' })).not.toBeInTheDocument();
  });

  it('keeps the sticky action bar inset from the viewport bottom', async () => {
    await renderSettings();

    const discardButton = screen.getByRole('button', { name: 'Discard changes' });
    const actionBar = screen.getByTestId('portfolio-action-bar');

    expect(discardButton).toHaveClass('text-foreground');
    expect(discardButton).not.toHaveClass('text-muted-foreground');
    // Disabled state keeps a visible affordance instead of looking clickable.
    expect(discardButton).toHaveClass('disabled:opacity-50');
    expect(actionBar).toHaveClass('bottom-6');
    expect(actionBar).not.toHaveClass('bottom-0');
  });

  it('keeps the remove-logo control outside the clipped image layer', async () => {
    mock.fetchPortfolio.mockResolvedValueOnce({
      ...basePortfolio,
      logoUrl: 'https://cdn.tickif.test/logo.jpg',
    });
    await renderSettings();

    const logo = screen.getAllByAltText('Portfolio logo')[0];
    const removeLogo = screen.getByRole('button', { name: 'Remove logo' });

    expect(logo?.parentElement).toHaveClass('overflow-hidden');
    expect(removeLogo.parentElement).not.toHaveClass('overflow-hidden');
  });

  it('keeps collapsible content mounted while the close transition runs', async () => {
    const slugInput = await renderSettings();
    const linkSectionToggle = screen.getByRole('button', { name: /link & url/i });

    vi.useFakeTimers();
    fireEvent.click(linkSectionToggle);

    expect(linkSectionToggle).toHaveAttribute('aria-expanded', 'false');
    expect(slugInput).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(320);
    });

    expect(slugInput).not.toBeInTheDocument();
  });

  it('opens the Link & URL content with one click after it has fully collapsed', async () => {
    await renderSettings();
    const linkSectionToggle = screen.getByRole('button', { name: /link & url/i });

    vi.useFakeTimers();
    fireEvent.click(linkSectionToggle);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(320);
    });

    expect(screen.queryByPlaceholderText(SLUG_PLACEHOLDER)).not.toBeInTheDocument();

    fireEvent.click(linkSectionToggle);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(32);
    });

    expect(linkSectionToggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByPlaceholderText(SLUG_PLACEHOLDER)).toBeInTheDocument();
  });

  it('reverses the Link & URL close transition when reopened immediately', async () => {
    const slugInput = await renderSettings();
    const linkSectionToggle = screen.getByRole('button', { name: /link & url/i });
    vi.useFakeTimers();
    fireEvent.click(linkSectionToggle);
    fireEvent.click(linkSectionToggle);

    expect(linkSectionToggle).toHaveAttribute('aria-expanded', 'true');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(320);
    });

    expect(slugInput).toBeInTheDocument();
  });

  it('opens every initially collapsed portfolio section with one click', async () => {
    await renderSettings();
    const sections = [
      {
        name: 'Trust & credentials',
        getContent: () => screen.getByAltText('Verified'),
      },
      {
        name: 'Featured testimonial',
        getContent: () => screen.getByPlaceholderText('Select a project'),
      },
      {
        name: 'Reviews',
        getContent: () => screen.getByText(/for fetching reviews from your google maps locations/i),
      },
      {
        name: 'Social links',
        getContent: () => screen.getByText(/^website$/i),
      },
      {
        name: 'Share block',
        getContent: () =>
          screen.getByText(/encourages visitors to copy and share your portfolio link/i),
      },
    ];

    vi.useFakeTimers();

    for (const section of sections) {
      const heading = screen.getByRole('heading', { name: section.name });
      const toggle = heading.closest('button');

      expect(toggle).not.toBeNull();
      expect(toggle).toHaveAttribute('aria-expanded', 'false');

      if (!toggle) continue;
      fireEvent.click(toggle);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(32);
      });

      expect(toggle).toHaveAttribute('aria-expanded', 'true');
      const content = section.getContent();
      expect(content).toBeInTheDocument();
      expect(content.closest('[data-slot="portfolio-section-content"]')).toHaveClass(
        'border',
        'border-border',
      );
    }
  });

  it('applies the section border to every expanded dropdown content card', async () => {
    await renderSettings();

    const initiallyExpandedContent = document.querySelectorAll(
      '[data-slot="portfolio-section-content"]',
    );

    expect(initiallyExpandedContent).toHaveLength(3);
    initiallyExpandedContent.forEach((content) => {
      expect(content).toHaveClass('border', 'border-border');
    });
  });

  it('shows the complete Google reviews connection summary', async () => {
    mock.fetchGoogleReviews.mockResolvedValue({
      available: true,
      connection: {
        status: 'connected',
        placeId: 'ChIJabc',
        rating: 4.8,
        userRatingsTotal: 42,
        lastFetchedAt: '2026-07-23T00:00:00.000Z',
      },
      reviews: [],
    });
    await renderSettings();
    const reviewsHeading = screen.getByRole('heading', { name: 'Reviews' });
    const reviewsToggle = reviewsHeading.closest('button');

    expect(reviewsToggle).not.toBeNull();
    await userEvent.click(reviewsToggle!);

    // Summary renders once the connected snapshot has loaded.
    await screen.findByTestId('reviews-summary');
    expect(screen.getAllByText('Connected')).toHaveLength(2);
    expect(screen.getByText('4.8')).toBeInTheDocument();
    expect(screen.getByText('42 reviews')).toBeInTheDocument();
    expect(screen.getByTestId('review-rating-star')).toHaveClass(
      'lucide-star',
      'size-3.5',
      'fill-current',
    );
    expect(
      screen.getByTestId('reviews-summary').querySelectorAll(
        'span[aria-hidden="true"]',
      ),
    ).toHaveLength(2);
    expect(
      Array.from(
        screen.getByTestId('reviews-summary').querySelectorAll(
          'span[aria-hidden="true"]',
        ),
      ).every((separator) => separator.textContent === '·'),
    ).toBe(true);
    expect(screen.getByTestId('reviews-integration')).toHaveClass(
      'border-b',
      'border-border',
    );
  });

  it('shows a retry-able error state when the portfolio fails to load', async () => {
    mock.fetchPortfolio.mockRejectedValueOnce(new Error('Could not load portfolio settings.'));
    render(<DesignerPortfolioSettings />);

    const retry = await screen.findByRole('button', { name: /retry/i });
    expect(screen.getAllByText(/could not load portfolio settings/i).length).toBeGreaterThan(0);

    const user = userEvent.setup();
    await user.click(retry);

    expect(await screen.findByPlaceholderText(SLUG_PLACEHOLDER)).toHaveValue('mahi-studio');
    expect(mock.fetchPortfolio).toHaveBeenCalledTimes(2);
  });

  it('keeps the save/discard controls disabled until a field changes', async () => {
    await renderSettings();

    expect(screen.getByRole('button', { name: /save changes/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /discard changes/i })).toBeDisabled();

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText(TAGLINE_PLACEHOLDER), '!');

    expect(screen.getByRole('button', { name: /save changes/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /discard changes/i })).toBeEnabled();
  });

  it('discard reverts edits and re-disables the save controls', async () => {
    await renderSettings();

    const user = userEvent.setup();
    const tagline = screen.getByPlaceholderText(TAGLINE_PLACEHOLDER);
    await user.clear(tagline);
    await user.type(tagline, 'Something else');
    await user.click(screen.getByRole('button', { name: /discard changes/i }));

    expect(tagline).toHaveValue('Design with care');
    expect(screen.getByRole('button', { name: /save changes/i })).toBeDisabled();
  });

  it('sanitizes slug input: lowercases, strips illegal characters, collapses hyphens', async () => {
    const slugInput = await renderSettings();

    fireEvent.change(slugInput, { target: { value: 'My  Studio!!--2' } });

    expect(slugInput).toHaveValue('mystudio-2');
  });

  it('shows the invalid state for a trailing hyphen and does not fire the availability check', async () => {
    const slugInput = await renderSettings();

    vi.useFakeTimers();
    fireEvent.change(slugInput, { target: { value: 'my-studio-' } });

    expect(slugInput).toHaveValue('my-studio-');
    expect(screen.getByText('Invalid')).toBeInTheDocument();
    expect(screen.getByText(/no leading or trailing hyphen/i)).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(mock.checkSlugAvailability).not.toHaveBeenCalled();
  });

  it('debounces the availability check and shows the available state', async () => {
    mock.checkSlugAvailability.mockResolvedValue({ slug: 'new-studio', available: true });
    const slugInput = await renderSettings();

    vi.useFakeTimers();
    fireEvent.change(slugInput, { target: { value: 'new-stud' } });
    fireEvent.change(slugInput, { target: { value: 'new-studio' } });

    expect(mock.checkSlugAvailability).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(mock.checkSlugAvailability).toHaveBeenCalledTimes(1);
    expect(mock.checkSlugAvailability).toHaveBeenCalledWith('new-studio');
    expect(screen.getByText('Available')).toBeInTheDocument();
  });

  it('shows the taken state when the slug is unavailable', async () => {
    mock.checkSlugAvailability.mockResolvedValue({ slug: 'taken-slug', available: false });
    const slugInput = await renderSettings();

    vi.useFakeTimers();
    fireEvent.change(slugInput, { target: { value: 'taken-slug' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(screen.getByText('Taken')).toBeInTheDocument();
  });

  it('shows the check-failed state when the availability check rejects', async () => {
    mock.checkSlugAvailability.mockRejectedValue(new Error('network down'));
    const slugInput = await renderSettings();

    vi.useFakeTimers();
    fireEvent.change(slugInput, { target: { value: 'new-studio' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(screen.getByText('Check failed')).toBeInTheDocument();
    expect(screen.getByText(/could not check slug availability/i)).toBeInTheDocument();
  });

  it('saves only changed fields, nulls cleared optional text, and omits a cleared display name', async () => {
    mock.updatePortfolio.mockResolvedValue({
      ...basePortfolio,
      tagline: 'Bespoke interiors',
      bio: null,
    });
    await renderSettings();

    const user = userEvent.setup();
    const tagline = screen.getByPlaceholderText(TAGLINE_PLACEHOLDER);
    await user.clear(tagline);
    await user.type(tagline, 'Bespoke interiors');
    await user.clear(screen.getByPlaceholderText(BIO_PLACEHOLDER));
    await user.clear(screen.getByPlaceholderText(STUDIO_NAME_PLACEHOLDER));

    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(mock.updatePortfolio).toHaveBeenCalledTimes(1);
    });
    expect(mock.updatePortfolio.mock.calls[0]?.[0]).toEqual({
      tagline: 'Bespoke interiors',
      bio: null,
    });

    expect(await screen.findByText('Saved')).toBeInTheDocument();
    // Form resets to the server response, so the save controls disable again.
    expect(screen.getByRole('button', { name: /save changes/i })).toBeDisabled();
    expect(screen.getByPlaceholderText(STUDIO_NAME_PLACEHOLDER)).toHaveValue('Mahi Studio');
  });

  it('surfaces the detail-derived message when the save fails validation', async () => {
    mock.updatePortfolio.mockRejectedValue(
      new Error('portfolioSlug: Lowercase letters, numbers, and hyphens only'),
    );
    await renderSettings();

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText(TAGLINE_PLACEHOLDER), '!');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(
      await screen.findByText('portfolioSlug: Lowercase letters, numbers, and hyphens only'),
    ).toBeInTheDocument();
    // Still dirty once the save transition settles, so the user can retry.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /save changes/i })).toBeEnabled();
    });
  });

  it('keeps edits made while a save is in flight instead of clobbering them with the server response', async () => {
    let resolveSave!: (value: PortfolioResponse) => void;
    mock.updatePortfolio.mockImplementation(
      () =>
        new Promise<PortfolioResponse>((resolve) => {
          resolveSave = resolve;
        }),
    );
    await renderSettings();

    const user = userEvent.setup();
    const tagline = screen.getByPlaceholderText(TAGLINE_PLACEHOLDER);
    await user.clear(tagline);
    await user.type(tagline, 'First edit');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(mock.updatePortfolio).toHaveBeenCalledWith({ tagline: 'First edit' });
    });

    // Edit again while the PATCH is still pending.
    await user.type(tagline, ' plus more');

    await act(async () => {
      resolveSave({ ...basePortfolio, tagline: 'First edit' });
    });

    expect(await screen.findByText('Saved')).toBeInTheDocument();
    // The in-flight edit is preserved, so the form stays dirty and savable.
    expect(tagline).toHaveValue('First edit plus more');
    expect(screen.getByRole('button', { name: /save changes/i })).toBeEnabled();
  });

  describe('Bug condition: stale portfolio state after logo operation', () => {
    /**
     * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5
     *
     * Bug condition exploration test — demonstrates that after a successful
     * logo upload, the component does NOT refresh server-derived fields
     * (missingRequiredFields, publiclyVisible, badges) from the server.
     *
     * EXPECTED: This test SHOULD FAIL on unfixed code, confirming the bug exists.
     */
    it('refreshes portfolio state after logo upload so the visibility notice disappears', async () => {
      // Arrange: portfolio is NOT public because logo is missing
      const portfolioBeforeUpload: PortfolioResponse = {
        ...basePortfolio,
        logoUrl: null,
        publiclyVisible: false,
        missingRequiredFields: ['logo'],
        badges: [],
      };

      // After upload, server returns portfolio with logo fulfilled
      const portfolioAfterUpload: PortfolioResponse = {
        ...basePortfolio,
        logoUrl: 'https://storage.example.com/new-logo.jpg',
        publiclyVisible: true,
        missingRequiredFields: [],
        badges: ['verified'],
      };

      // Initial load returns the "before" state
      mock.fetchPortfolio.mockResolvedValueOnce(portfolioBeforeUpload);
      // After upload, fetchPortfolio should be called again and return fresh state
      mock.fetchPortfolio.mockResolvedValueOnce(portfolioAfterUpload);
      mock.uploadLogo.mockResolvedValue({ logoUrl: 'https://storage.example.com/new-logo.jpg' });

      render(<DesignerPortfolioSettings />);

      // Wait for initial load — should show the "not public" notice
      const notice = await screen.findByRole('status');
      expect(notice).toHaveTextContent("Your portfolio isn't public yet");

      // Act: trigger logo upload via file input
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      expect(fileInput).not.toBeNull();

      const file = new File(['logo-data'], 'logo.png', { type: 'image/png' });
      await act(async () => {
        fireEvent.change(fileInput, { target: { files: [file] } });
      });

      // Assert: after upload, the component should have refreshed portfolio state
      // and the "not public" notice should be gone (missingRequiredFields is now [])
      await waitFor(() => {
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
      });
    });

    /**
     * Validates: Requirements 3.1, 3.2
     *
     * Preservation test — verifies that unsaved form edits are NOT overwritten
     * when a logo upload triggers a portfolio state refresh from the server.
     */
    it('preserves unsaved form edits after logo upload refreshes portfolio state', async () => {
      // After upload, server returns a refreshed portfolio with a DIFFERENT tagline
      const portfolioAfterUpload: PortfolioResponse = {
        ...basePortfolio,
        logoUrl: 'https://storage.example.com/new-logo.jpg',
        tagline: 'Server tagline after refresh',
      };

      // Initial load returns basePortfolio
      mock.fetchPortfolio.mockResolvedValueOnce(basePortfolio);
      // After upload, fetchPortfolio returns the refreshed state
      mock.fetchPortfolio.mockResolvedValueOnce(portfolioAfterUpload);
      mock.uploadLogo.mockResolvedValue({ logoUrl: 'https://storage.example.com/new-logo.jpg' });

      render(<DesignerPortfolioSettings />);

      // Wait for initial load
      const tagline = await screen.findByPlaceholderText(TAGLINE_PLACEHOLDER);
      expect(tagline).toHaveValue('Design with care');

      // User makes an unsaved edit to the tagline
      const user = userEvent.setup();
      await user.clear(tagline);
      await user.type(tagline, 'My unsaved edit');
      expect(tagline).toHaveValue('My unsaved edit');

      // Act: trigger logo upload
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      expect(fileInput).not.toBeNull();

      const file = new File(['logo-data'], 'logo.png', { type: 'image/png' });
      await act(async () => {
        fireEvent.change(fileInput, { target: { files: [file] } });
      });

      // Assert: form tagline still shows the user's unsaved edit, NOT the server value
      await waitFor(() => {
        expect(mock.fetchPortfolio).toHaveBeenCalledTimes(2);
      });
      expect(tagline).toHaveValue('My unsaved edit');
    });
  });

  describe('Google reviews', () => {
    // The Reviews section is collapsed by default; expand it to reveal the card.
    async function expandReviews() {
      const user = userEvent.setup();
      await renderSettings();
      await user.click(screen.getByRole('button', { name: 'Toggle Reviews details' }));
      return user;
    }

    it('shows a Connect input when no location is linked', async () => {
      await expandReviews();
      expect(
        await screen.findByPlaceholderText('Google Maps link or business name'),
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /connect/i })).toBeDisabled();
    });

    it('connects a location and shows the pending state', async () => {
      mock.connectGoogleReviews.mockResolvedValue({
        available: true,
        connection: { status: 'pending', placeId: 'ChIJabc', rating: null, userRatingsTotal: null, lastFetchedAt: null },
        reviews: [],
      });

      const user = await expandReviews();
      const input = await screen.findByPlaceholderText('Google Maps link or business name');
      await user.type(input, 'Studio Aakar, Bengaluru');
      await user.click(screen.getByRole('button', { name: /connect/i }));

      await waitFor(() => {
        expect(mock.connectGoogleReviews).toHaveBeenCalledWith('Studio Aakar, Bengaluru');
      });
      expect(await screen.findByText('Connecting')).toBeInTheDocument();
    });

    it('renders the connected rating from the loaded snapshot', async () => {
      mock.fetchGoogleReviews.mockResolvedValue({
        available: true,
        connection: {
          status: 'connected',
          placeId: 'ChIJabc',
          rating: 4.8,
          userRatingsTotal: 132,
          lastFetchedAt: '2026-07-23T00:00:00.000Z',
        },
        reviews: [],
      });

      await expandReviews();
      expect(await screen.findByText(/132 reviews/i)).toBeInTheDocument();
      expect(screen.getByText('4.8')).toBeInTheDocument();
      // "Connected" shows twice: the status badge and the summary badge.
      expect(screen.getAllByText('Connected')).toHaveLength(2);
    });

    it('reports the feature as unavailable when the platform has no key', async () => {
      mock.fetchGoogleReviews.mockResolvedValue({ available: false, connection: null, reviews: [] });
      await expandReviews();
      expect(await screen.findByText(/isn.t enabled on this workspace/i)).toBeInTheDocument();
    });

    it('surfaces the error state with a needs-attention badge and guidance', async () => {
      mock.fetchGoogleReviews.mockResolvedValue({
        available: true,
        connection: {
          status: 'error',
          placeId: 'ChIJabc',
          rating: null,
          userRatingsTotal: null,
          lastFetchedAt: null,
        },
        reviews: [],
      });

      await expandReviews();
      expect(await screen.findByText('Needs attention')).toBeInTheDocument();
      expect(screen.getByText(/couldn.t fetch reviews for this location/i)).toBeInTheDocument();
      // Refresh/disconnect controls remain available so the designer can recover.
      expect(screen.getByRole('button', { name: /refresh/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /disconnect/i })).toBeInTheDocument();
    });
  });
});
