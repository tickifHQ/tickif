import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FeedProject, GalleryImage } from '@repo/contracts';
import { ImageDetailView } from '../../src/components/image-detail-view';

const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

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
  coverImageId: '22222222-2222-4222-8222-222222222222',
  coverImageUrl: null,
  imageWidth: 480,
  imageHeight: 600,
};

const gallery: GalleryImage[] = [
  {
    id: '22222222-2222-4222-8222-222222222222',
    url: 'https://images.example.com/living-room.jpg',
    width: 800,
    height: 600,
    roomName: 'Living room',
  },
  {
    id: '33333333-3333-4333-8333-333333333333',
    url: 'https://images.example.com/kitchen.jpg',
    width: 800,
    height: 600,
    roomName: 'Kitchen',
  },
];

describe('ImageDetailView', () => {
  beforeEach(() => {
    push.mockClear();
  });

  // Signed out, EnquiryCta renders a link to the login page rather than opening
  // the dialog, but it keeps the inverted design-system button styling.
  it('uses the compact inverted design-system styling for the enquiry CTA', () => {
    render(
      <ImageDetailView
        project={project}
        gallery={gallery}
        moreProjects={[]}
        activeImageId={gallery[0]!.id}
      />,
    );

    const enquire = screen.getByRole('link', { name: /enquire/i });

    expect(enquire).toHaveClass(
      'h-9',
      'bg-button-inverted',
      'text-button-inverted-foreground',
    );
    expect(enquire).toHaveAttribute('href', `/login?next=/image/${gallery[0]!.id}`);
    expect(enquire.querySelector('.lucide-message-square')).toBeInTheDocument();
  });

  it('routes each selected thumbnail to its own image detail URL', () => {
    render(
      <ImageDetailView
        project={project}
        gallery={gallery}
        moreProjects={[]}
        activeImageId={gallery[0]!.id}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /kitchen/i }));

    expect(push).toHaveBeenCalledWith(`/image/${gallery[1]!.id}`, { scroll: false });
  });

  it('links the image detail CTA back to the project route', () => {
    render(
      <ImageDetailView
        project={project}
        gallery={gallery}
        moreProjects={[]}
        activeImageId={gallery[0]!.id}
      />,
    );

    expect(screen.getByRole('link', { name: /visit full project/i })).toHaveAttribute(
      'href',
      `/projects/${project.id}`,
    );
  });
});
