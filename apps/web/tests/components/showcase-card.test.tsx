vi.mock('@/components/project-actions', () => ({
  ProjectActions: () => <button aria-label="Save project" />,
}));
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DesignerProjectCard, DiscoveryCard, FeedProject } from '@repo/contracts';
import { PublicProjectCard } from '../../src/components/public-project-card';
import { ShowcaseCard } from '../../src/components/showcase-card';

vi.mock('@/components/project-view-count', () => ({
  ProjectViewCount: () => (
    <span role="img" aria-label="0 project views">
      0
    </span>
  ),
}));

const feedProject: FeedProject = {
  id: '11111111-1111-4111-8111-111111111111',
  slug: 'sunlit-bandra-apartment',
  title: 'Sunlit Bandra Apartment',
  studio: 'Studio A',
  city: 'Mumbai',
  locality: 'Bandra',
  rating: 4.5,
  reviewCount: 10,
  budget: '₹15L - ₹35L',
  tags: ['3 BHK'],
  coverImageId: '22222222-2222-4222-8222-222222222222',
  coverImageUrl: 'https://images.example.com/cover.jpg',
  imageWidth: 480,
  imageHeight: 600,
};

const designerProject: DesignerProjectCard = {
  ...feedProject,
  propertyType: '3 BHK · Apartment',
  bhk: '3 BHK',
  theme: 'Contemporary',
  completionYear: 2025,
  sizeSqft: 1200,
};

// `discoveryCardSchema` is an alias of `feedProjectSchema`, so a discovery card is
// the same shape — it just arrives without a cover image row id.
const discoveryProject: DiscoveryCard = {
  id: '33333333-3333-4333-8333-333333333333',
  slug: 'discovery-project',
  title: 'Discovery Project',
  studio: 'Studio B',
  city: 'Pune',
  locality: null,
  rating: 4.8,
  reviewCount: 12,
  budget: '₹15L - ₹35L',
  tags: ['2 BHK'],
  coverImageId: null,
  coverImageUrl: 'https://images.example.com/discovery.jpg',
  imageWidth: 640,
  imageHeight: 800,
};

describe('ShowcaseCard', () => {
  it('places the accessible Lucide verification tick beside the verified studio name', () => {
    render(
      <ShowcaseCard project={{ ...feedProject, studioIsVerified: true }} presentation="visitor" />,
    );
    const tick = screen.getByLabelText('Verified studio');
    expect(tick).toHaveClass(
      'lucide-badge-check',
      'size-3.5',
      'shrink-0',
      'fill-primary',
      'text-primary-foreground',
    );
    const studio = screen.getByText(feedProject.studio);
    expect(studio.nextElementSibling).toBe(tick);
  });
  it.each([false, undefined])(
    'does not badge unverified or unknown studios (%s)',
    (studioIsVerified) => {
      render(
        <ShowcaseCard project={{ ...feedProject, studioIsVerified }} presentation="visitor" />,
      );
      expect(screen.queryByLabelText('Verified studio')).toBeNull();
    },
  );
  it('shows a real compact budget and decorative card branding without replacing image bytes', () => {
    render(
      <ShowcaseCard project={{ ...feedProject, budget: '₹40L - ₹50L' }} presentation="visitor" />,
    );
    const budget = screen.getByText('₹40–50L');
    expect(budget).toHaveAttribute('data-slot', 'badge');
    expect(budget).toHaveClass('bg-project-budget', 'font-mono');
    expect(budget.parentElement).toHaveClass('absolute', 'bottom-2.5', 'inset-x-2.5', 'flex-wrap');
    expect(screen.getByText('TICKIF')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText('TICKIF')).toHaveClass('pointer-events-none', 'ml-auto');
    expect(screen.getByRole('img', { name: feedProject.title })).toHaveAttribute(
      'src',
      feedProject.coverImageUrl,
    );
    expect(screen.getByRole('link')).not.toHaveAccessibleName(/TICKIF/);
  });

  it.each([null, '', '   '])('does not invent a budget for %s', (budget) => {
    const { container } = render(
      <ShowcaseCard project={{ ...feedProject, budget }} presentation="visitor" />,
    );
    expect(container.querySelector('[data-slot="badge"]')).toBeNull();
  });

  it('does not put a photo watermark over the visitor missing-image fallback', () => {
    const { rerender } = render(<ShowcaseCard project={feedProject} presentation="visitor" />);
    expect(screen.getByText('TICKIF')).toBeInTheDocument();
    fireEvent.error(screen.getByRole('img', { name: feedProject.title }));
    expect(screen.queryByText('TICKIF')).toBeNull();
    rerender(
      <ShowcaseCard
        project={{ ...feedProject, coverImageUrl: 'https://images.example.com/replaced.jpg' }}
        presentation="visitor"
      />,
    );
    expect(screen.getByText('TICKIF')).toBeInTheDocument();
  });

  it('shows the supplied studio logo and falls back to initials if it fails', () => {
    const logoProject = { ...feedProject, studioLogoUrl: 'https://images.example.com/studio.png' };
    const { container, rerender } = render(
      <ShowcaseCard project={logoProject} presentation="visitor" />,
    );
    const logo = container.querySelector('img[src="https://images.example.com/studio.png"]');
    expect(logo).toBeInTheDocument();
    fireEvent.error(logo!);
    const fallback = container.querySelector('img[src^="data:image/svg+xml"]');
    expect(fallback).toBeInTheDocument();
    expect(decodeURIComponent(fallback!.getAttribute('src')!)).toContain('>SA</text>');
    rerender(
      <ShowcaseCard
        project={{ ...logoProject, studioLogoUrl: 'https://images.example.com/replaced.png' }}
        presentation="visitor"
      />,
    );
    expect(
      container.querySelector('img[src="https://images.example.com/replaced.png"]'),
    ).toBeInTheDocument();
  });
  it('shows real studio metadata and save actions in the visitor feed without trust claims', () => {
    const { container } = render(<ShowcaseCard project={feedProject} presentation="visitor" />);
    expect(screen.getByText('Studio A')).toBeInTheDocument();
    expect(screen.getByText('· Bandra')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save project' })).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute('href', `/image/${feedProject.coverImageId}`);
    expect(screen.queryByText(/verified|sponsored|following/i)).toBeNull();
    expect(screen.getByRole('img', { name: feedProject.title }).parentElement).toHaveClass(
      'aspect-4/5',
    );
    expect(container.querySelector('.sm\\:opacity-0')).toBeNull();
  });

  it('keeps a visitor card useful when its cover and location are missing', () => {
    render(
      <ShowcaseCard
        project={{ ...feedProject, coverImageUrl: null, city: null, locality: null }}
        presentation="visitor"
      />,
    );
    expect(
      screen.getByRole('img', { name: `${feedProject.title} image unavailable` }),
    ).toBeInTheDocument();
    expect(screen.getByText('Studio A')).toBeInTheDocument();
    expect(screen.queryByText('Bandra')).toBeNull();
  });
  it('falls back when a visitor cover fails to load and recovers for a new source', () => {
    const { rerender } = render(<ShowcaseCard project={feedProject} presentation="visitor" />);
    fireEvent.error(screen.getByRole('img', { name: feedProject.title }));
    expect(
      screen.getByRole('img', { name: `${feedProject.title} image unavailable` }),
    ).toBeInTheDocument();
    rerender(
      <ShowcaseCard
        project={{ ...feedProject, coverImageUrl: 'https://images.example.com/new-cover.jpg' }}
        presentation="visitor"
      />,
    );
    expect(screen.getByRole('img', { name: feedProject.title })).toHaveAttribute(
      'src',
      'https://images.example.com/new-cover.jpg',
    );
  });
  it('keeps landing metadata location-only, matching the compact discovery cards', () => {
    render(<ShowcaseCard project={feedProject} presentation="landing" />);
    expect(screen.queryByText('3 BHK')).not.toBeInTheDocument();
    expect(screen.queryByText('Studio A')).not.toBeInTheDocument();
    expect(screen.getByText('Bandra, Mumbai')).toBeInTheDocument();
    expect(screen.queryByText('SA')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: feedProject.title })).toBeInTheDocument();
    expect(screen.queryByText(/verified|sponsored/i)).toBeNull();
  });
  it('links feed image cards to the cover image detail page', () => {
    render(<ShowcaseCard project={feedProject} />);

    expect(screen.getByRole('link')).toHaveAttribute('href', `/image/${feedProject.coverImageId}`);
  });

  it('falls back to the project route when there is no cover image id', () => {
    render(<ShowcaseCard project={{ ...feedProject, coverImageId: null }} />);

    expect(screen.getByRole('link')).toHaveAttribute('href', `/projects/${feedProject.id}`);
  });

  it('renders discovery cards with stable dimensions and links by project id', () => {
    render(<ShowcaseCard project={discoveryProject} />);

    expect(screen.getByRole('link')).toHaveAttribute('href', `/projects/${discoveryProject.id}`);
    expect(screen.getByRole('img', { name: discoveryProject.title })).toHaveAttribute(
      'width',
      '640',
    );
    expect(screen.getByText('₹15–35L')).toBeInTheDocument();
    // E-303: hover metadata shows location only — studio, tags and rating are dropped.
    expect(screen.getByText('Pune')).toBeInTheDocument();
    expect(screen.queryByText('Studio B')).not.toBeInTheDocument();
    expect(screen.queryByText('2 BHK')).not.toBeInTheDocument();
    expect(screen.queryByText('4.8')).not.toBeInTheDocument();
  });

  it('enforces the allocator fallback ratio when source dimensions are unavailable', () => {
    render(<ShowcaseCard project={{ ...discoveryProject, imageWidth: null, imageHeight: null }} />);

    const image = screen.getByRole('img', { name: discoveryProject.title });
    expect(image).toHaveAttribute('width', '480');
    expect(image).toHaveAttribute('height', '600');
    expect(image).toHaveStyle({ aspectRatio: '480 / 600' });
  });

  it('keeps the natural ratio when source dimensions are available', () => {
    render(<ShowcaseCard project={discoveryProject} />);

    expect(screen.getByRole('img', { name: discoveryProject.title })).not.toHaveStyle({
      aspectRatio: '480 / 600',
    });
  });

  it('hides the rating on search-sourced cards that carry no reviews', () => {
    render(<ShowcaseCard project={{ ...discoveryProject, rating: 0, reviewCount: 0 }} />);

    expect(screen.queryByText('0.0')).not.toBeInTheDocument();
  });

  it('does not render save or share controls on feed cards', () => {
    const { container } = render(<ShowcaseCard project={discoveryProject} />);

    expect(container.querySelector('[aria-label="Save"]')).not.toBeInTheDocument();
    expect(container.querySelector('[aria-label="Share"]')).not.toBeInTheDocument();
  });

  it('keeps the hover title on one line with compact typography and omits tags (E-303)', () => {
    render(<ShowcaseCard project={{ ...feedProject, imageWidth: 800, imageHeight: 420 }} />);

    // Single-line, truncated (ellipsis) title at the smaller hover size — never wraps.
    const heading = screen.getByRole('heading', { name: feedProject.title });
    expect(heading).toHaveClass('truncate', 'text-xs');
    expect(heading).not.toHaveClass('line-clamp-2');
    // Tags are no longer rendered in the hover state.
    expect(screen.queryByText('3 BHK')).not.toBeInTheDocument();
  });
});

describe('PublicProjectCard', () => {
  it('links portfolio project cards to the cover image detail page', () => {
    render(<PublicProjectCard project={designerProject} studioName="Studio A" />);

    expect(screen.getByRole('link')).toHaveAttribute(
      'href',
      `/image/${designerProject.coverImageId}`,
    );
  });

  it('supports project-detail recommendation cards with sourced ratings', () => {
    render(
      <PublicProjectCard
        project={designerProject}
        studioName="Studio A"
        presentation="recommendation"
        destination="project"
        showRating
      />,
    );

    expect(screen.getByRole('link')).toHaveAttribute('href', `/projects/${designerProject.id}`);
    expect(screen.getByLabelText('Studio A studio rating 4.5 out of 5')).toHaveTextContent(
      /Studio.*4\.5/,
    );
    expect(screen.getByText('2025')).toHaveClass('font-mono', 'text-2xs/none');
    expect(screen.getByText('3 BHK · Contemporary')).toBeInTheDocument();
    expect(screen.getByText('₹15–35L')).toBeInTheDocument();
  });

  it('keeps the real portfolio year inside the project link', () => {
    render(<PublicProjectCard project={designerProject} studioName="Studio A" />);

    expect(screen.getByRole('link')).toContainElement(screen.getByText('2025'));
  });

  it('does not display an unrated project as trusted', () => {
    render(
      <PublicProjectCard
        project={{ ...designerProject, rating: 0, reviewCount: 0 }}
        studioName="Studio A"
        showRating
      />,
    );

    expect(screen.queryByText('0.0')).toBeNull();
  });
});
