import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DesignerProjectCard, DiscoveryCard, FeedProject } from '@repo/contracts';
import { PublicProjectCard } from '../../src/components/public-project-card';
import { ShowcaseCard } from '../../src/components/showcase-card';

vi.mock('@/components/project-like-button', () => ({
  ProjectLikeButton: () => <button>Like</button>,
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
    expect(screen.getByText('2025')).toHaveClass('font-mono', 'text-2xs');
    expect(screen.getByText('3 BHK · Contemporary')).toBeInTheDocument();
    expect(screen.getByText('₹15–35L')).toBeInTheDocument();
  });

  it('keeps the established portfolio year badge typography', () => {
    render(<PublicProjectCard project={designerProject} studioName="Studio A" />);

    expect(screen.getByText('2025')).toHaveClass('font-mono', 'text-xs', 'font-semibold');
    expect(screen.getByText('2025')).not.toHaveClass('text-2xs');
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
