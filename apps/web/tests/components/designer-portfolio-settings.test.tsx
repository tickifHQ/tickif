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
}));

vi.mock('@/lib/portfolio-api', () => ({
  fetchPortfolio: mock.fetchPortfolio,
  updatePortfolio: mock.updatePortfolio,
  checkSlugAvailability: mock.checkSlugAvailability,
  uploadLogo: mock.uploadLogo,
  deleteLogo: mock.deleteLogo,
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
  portfolioUrl: 'https://tickif.com/p/mahi-studio',
  publishedAt: null,
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
};

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
    expect(screen.getByText('https://tickif.com/p/mahi-studio')).toBeInTheDocument();
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
});
