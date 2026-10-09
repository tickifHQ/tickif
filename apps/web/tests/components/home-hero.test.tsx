vi.mock('@/components/project-actions', () => ({
  ProjectActions: () => <button aria-label="Save project" />,
}));
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { FeedProject } from '@repo/contracts';
import { HomeHero } from '@/components/home-hero';
import { LandingDesignerCallout, LandingDirectory } from '@/components/landing-directory';
import {
  LandingProjectPreviewProvider,
  useLandingProjectPreviews,
} from '@/components/landing-project-preview';

vi.mock('@/components/home-search-bar', () => ({ HomeSearchBar: () => <form role="search" /> }));

const project: FeedProject = {
  id: '11111111-1111-4111-8111-111111111111',
  slug: 'published-home',
  title: 'Published home',
  studio: 'Real Studio',
  city: 'Chennai',
  locality: null,
  budget: '₹15L - ₹35L',
  rating: 0,
  reviewCount: 0,
  tags: [],
  coverImageId: null,
  coverImageUrl: 'https://media.example.com/published.jpg',
  imageWidth: 1200,
  imageHeight: 800,
};

describe('Landing page content', () => {
  it('shares real photos with the login preview and clears them on homepage unmount', () => {
    function Preview() {
      const projects = useLandingProjectPreviews();
      return <p data-testid="preview-titles">{projects?.map((item) => item.title).join(', ')}</p>;
    }
    const { rerender } = render(
      <LandingProjectPreviewProvider>
        <HomeHero shortcuts={[]} projects={[project]} />
        <Preview />
      </LandingProjectPreviewProvider>,
    );
    expect(screen.getByTestId('preview-titles')).toHaveTextContent(project.title);
    rerender(
      <LandingProjectPreviewProvider>
        <Preview />
      </LandingProjectPreviewProvider>,
    );
    expect(screen.getByTestId('preview-titles')).toBeEmptyDOMElement();
  });
  it('uses the API project image, title, budget and destination in the hero', () => {
    render(<HomeHero shortcuts={[]} projects={[project]} />);
    expect(screen.getByRole('img', { name: project.title })).toHaveAttribute(
      'src',
      project.coverImageUrl,
    );
    expect(screen.getByRole('link', { name: /Published home/ })).toHaveAttribute(
      'href',
      `/projects/${project.id}`,
    );
    expect(screen.getByText('Chennai · ₹15–35L')).toBeInTheDocument();
    expect(screen.queryByText(/12,480|41,260|1,940|COST VERIFIED BY HOMEOWNER/)).toBeNull();
  });

  it('does not replace missing API photography with sample homes', () => {
    const { container } = render(
      <HomeHero shortcuts={[]} projects={[{ ...project, coverImageUrl: null }]} />,
    );
    expect(screen.queryByRole('img', { name: project.title })).toBeNull();
    expect(
      container.querySelector('img[src="/images/landing/headline-dining.jpg"]'),
    ).not.toBeNull();
    expect(screen.getByRole('search')).toBeInTheDocument();
  });

  it('shows API totals without substituting the sample Figma statistics', () => {
    render(
      <HomeHero
        shortcuts={[]}
        projects={[project]}
        community={{
          projectCount: 84,
          designers: {
            hits: [],
            estimatedTotalHits: 12,
            facetDistribution: {},
            processingTimeMs: 1,
            page: 1,
            limit: 4,
          },
        }}
      />,
    );
    expect(screen.getByText('84')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.queryByText(/41,260|1,940|verified designers/i)).toBeNull();
  });

  it('builds browse links from taxonomy slugs without fabricated counts', () => {
    render(
      <LandingDirectory options={{ room: [{ slug: 'living-room', label: 'Living room' }] }} />,
    );
    expect(screen.getByRole('link', { name: 'Living room' })).toHaveAttribute(
      'href',
      '/?room=living-room',
    );
    expect(screen.queryByRole('navigation', { name: 'By city' })).toBeNull();
  });

  it('shows unavailable plans without inventing a paid offer', () => {
    render(<LandingDesignerCallout catalog={null} />);
    expect(screen.getByRole('link', { name: 'View plans' })).toHaveAttribute(
      'href',
      '/designer/plan-billing/subscribe',
    );
    expect(screen.queryByText(/2,999|7,990|3 months free|48 hrs/)).toBeNull();
  });
});
