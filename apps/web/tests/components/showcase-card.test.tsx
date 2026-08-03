import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { DesignerProjectCard, FeedProject } from '@repo/contracts';
import { PublicProjectCard } from '../../src/components/public-project-card';
import { ShowcaseCard } from '../../src/components/showcase-card';

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
  completionYear: 2025,
  sizeSqft: 1200,
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
});

describe('PublicProjectCard', () => {
  it('links portfolio project cards to the cover image detail page', () => {
    render(<PublicProjectCard project={designerProject} studioName="Studio A" />);

    expect(screen.getByRole('link')).toHaveAttribute(
      'href',
      `/image/${designerProject.coverImageId}`,
    );
  });
});
