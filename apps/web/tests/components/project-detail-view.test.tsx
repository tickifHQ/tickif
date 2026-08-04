import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { FeedProject, GalleryImage } from '@repo/contracts';
import { ProjectDetailView } from '../../src/components/project-detail-view';

const project: FeedProject = {
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
  coverImageUrl: null,
  imageWidth: 480,
  imageHeight: 600,
};

const gallery: GalleryImage[] = [
  {
    id: 'image-1',
    url: 'https://images.example.com/project.jpg',
    width: 800,
    height: 600,
    roomName: 'Living room',
  },
];

describe('ProjectDetailView', () => {
  it('uses the compact inverted design-system button for enquiries', () => {
    render(<ProjectDetailView project={project} gallery={gallery} moreProjects={[]} />);

    expect(screen.getByRole('button', { name: /enquire/i })).toHaveClass(
      'h-9',
      'bg-button-inverted',
      'text-button-inverted-foreground',
    );
    expect(
      screen.getByRole('button', { name: /enquire/i }).querySelector('.lucide-message-square'),
    ).toBeInTheDocument();
  });
});
