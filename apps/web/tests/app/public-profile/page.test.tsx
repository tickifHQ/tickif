import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makePublicPortfolio } from '../../fixtures/public-portfolio';

const mock = vi.hoisted(() => ({
  fetchPublicPortfolio: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

vi.mock('@/lib/public-portfolio-api', () => ({
  fetchPublicPortfolio: mock.fetchPublicPortfolio,
  fetchDesignerProjects: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  notFound: mock.notFound,
  redirect: mock.redirect,
}));

vi.mock('@/components/public-designer-profile', () => ({
  PublicDesignerProfile: ({ portfolio }: { portfolio: { displayName: string } }) => (
    <div data-testid="profile">{portfolio.displayName}</div>
  ),
}));

const { default: PublicDesignerProfilePage, generateMetadata } = await import(
  '../../../app/(public-profile)/d/[slug]/page'
);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('/d/[slug]', () => {
  it('renders the profile for a published portfolio', async () => {
    mock.fetchPublicPortfolio.mockResolvedValue(makePublicPortfolio());

    render(await PublicDesignerProfilePage({ params: Promise.resolve({ slug: 'anika-spaces' }) }));

    expect(screen.getByTestId('profile')).toHaveTextContent('Anika Spaces');
    expect(mock.fetchPublicPortfolio).toHaveBeenCalledWith('anika-spaces');
  });

  it('404s when the API has no portfolio at that slug', async () => {
    mock.fetchPublicPortfolio.mockResolvedValue(null);

    await expect(
      PublicDesignerProfilePage({ params: Promise.resolve({ slug: 'nobody' }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND');
    expect(mock.notFound).toHaveBeenCalled();
  });

  it('redirects an org-slug URL to the designer’s canonical portfolio slug', async () => {
    mock.fetchPublicPortfolio.mockResolvedValue(
      makePublicPortfolio({ canonicalUrl: 'http://localhost:3000/d/anika-spaces' }),
    );

    await expect(
      PublicDesignerProfilePage({ params: Promise.resolve({ slug: 'anika-spaces-a1b2c3' }) }),
    ).rejects.toThrow('NEXT_REDIRECT:/d/anika-spaces');
  });

  it('does not redirect when already on the canonical slug', async () => {
    mock.fetchPublicPortfolio.mockResolvedValue(makePublicPortfolio());

    render(await PublicDesignerProfilePage({ params: Promise.resolve({ slug: 'anika-spaces' }) }));

    expect(mock.redirect).not.toHaveBeenCalled();
  });
});

describe('/d/[slug] metadata', () => {
  it('builds per-designer title, description, and canonical URL', async () => {
    mock.fetchPublicPortfolio.mockResolvedValue(makePublicPortfolio());

    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: 'anika-spaces' }),
    });

    expect(metadata.title).toBe('Anika Spaces | Tickif');
    expect(metadata.description).toBe('Quiet, light-filled homes with timeless materials.');
    expect(metadata.alternates?.canonical).toBe('http://localhost:3000/d/anika-spaces');
    expect(metadata.openGraph?.url).toBe('http://localhost:3000/d/anika-spaces');
  });

  it('falls back to a generated description when the designer wrote no tagline or bio', async () => {
    mock.fetchPublicPortfolio.mockResolvedValue(
      makePublicPortfolio({ tagline: null, bio: null, cities: ['Chennai'] }),
    );

    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: 'anika-spaces' }),
    });

    expect(metadata.description).toBe(
      'Explore verified residential interior design work by Anika Spaces in Chennai.',
    );
  });

  it('uses the newest project cover as the social share image', async () => {
    mock.fetchPublicPortfolio.mockResolvedValue(makePublicPortfolio());

    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: 'anika-spaces' }),
    });

    expect(metadata.openGraph?.images).toEqual(['https://cdn.example.test/projects/adyar.jpg']);
  });

  it('404s from generateMetadata so the response status is a real 404', async () => {
    // The gate lives here, not just in the page body: this route group has no
    // Suspense fallback, so deciding before render is what yields a true 404
    // rather than a soft 404 on a flushed 200 shell.
    mock.fetchPublicPortfolio.mockResolvedValue(null);

    await expect(
      generateMetadata({ params: Promise.resolve({ slug: 'nobody' }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('redirects from generateMetadata for a non-canonical slug', async () => {
    mock.fetchPublicPortfolio.mockResolvedValue(
      makePublicPortfolio({ canonicalUrl: 'http://localhost:3000/d/anika-spaces' }),
    );

    await expect(
      generateMetadata({ params: Promise.resolve({ slug: 'anika-spaces-a1b2c3' }) }),
    ).rejects.toThrow('NEXT_REDIRECT:/d/anika-spaces');
  });
});
