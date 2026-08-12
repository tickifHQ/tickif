import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FeedProject, PublicProjectGalleryImage, PublicProjectDesigner } from '@repo/contracts';
import { ImageDetailView } from '../../src/components/image-detail-view';

const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

vi.mock('@/lib/auth-client', () => ({
  authClient: { useSession: () => ({ data: null, isPending: false }) },
}));

vi.mock('@/env', () => ({
  env: { NEXT_PUBLIC_API_URL: 'http://localhost:8008' },
}));

vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ savedProjectIds: [] }) }));

const project: FeedProject & { description?: string | null } = {
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
  description: 'A modern apartment with clean lines and natural light.',
};

const designer: PublicProjectDesigner = {
  id: '44444444-4444-4444-8444-444444444444',
  displayName: 'Studio A',
  slug: 'studio-a',
  avgRating: '4.5',
  reviewCount: 10,
  entityType: 'company',
  logoUrl: null,
  bio: 'Award-winning studio',
  firmType: null,
  foundedYear: 2015,
  yearsExperience: 9,
  projectCount: 12,
  footprintCities: [],
};

const gallery: PublicProjectGalleryImage[] = [
  {
    id: '22222222-2222-4222-8222-222222222222',
    url: 'https://images.example.com/living-room.jpg',
    width: 800,
    height: 600,
    roomId: null,
    roomName: 'Living room',
    sortOrder: 0,
    themes: [],
    materials: [],
    finishes: [],
    tags: [],
  },
  {
    id: '33333333-3333-4333-8333-333333333333',
    url: 'https://images.example.com/kitchen.jpg',
    width: 800,
    height: 600,
    roomId: null,
    roomName: 'Kitchen',
    sortOrder: 1,
    themes: [],
    materials: [],
    finishes: [],
    tags: [],
  },
];

describe('ImageDetailView', () => {
  beforeEach(() => {
    push.mockClear();
    vi.mocked(fetch).mockClear();
  });

  it('uses the compact inverted design-system styling for the enquiry CTA', () => {
    render(
      <ImageDetailView
        project={project}
        gallery={gallery}
        designer={designer}
        narrative={null}
        similarProjects={[]}
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
        designer={designer}
        narrative={null}
        similarProjects={[]}
        activeImageId={gallery[0]!.id}
      />,
    );

    fireEvent.click(screen.getByRole('tab', { name: /kitchen/i }));

    expect(push).toHaveBeenCalledWith(`/image/${gallery[1]!.id}`, { scroll: false });
  });

  it('links the image detail CTA back to the project route', () => {
    render(
      <ImageDetailView
        project={project}
        gallery={gallery}
        designer={designer}
        narrative={null}
        similarProjects={[]}
        activeImageId={gallery[0]!.id}
      />,
    );

    expect(screen.getByRole('link', { name: /visit full project/i })).toHaveAttribute(
      'href',
      `/projects/${project.id}`,
    );
  });

  it('links the View profile button to the designer portfolio', () => {
    render(
      <ImageDetailView
        project={project}
        gallery={gallery}
        designer={designer}
        narrative={null}
        similarProjects={[]}
        activeImageId={gallery[0]!.id}
      />,
    );

    expect(screen.getByRole('link', { name: /view profile/i })).toHaveAttribute(
      'href',
      '/d/studio-a',
    );
  });

  it('displays the real project description instead of placeholder text', () => {
    render(
      <ImageDetailView
        project={project}
        gallery={gallery}
        designer={designer}
        narrative={null}
        similarProjects={[]}
        activeImageId={gallery[0]!.id}
      />,
    );

    expect(screen.getByText('A modern apartment with clean lines and natural light.')).toBeInTheDocument();
    expect(screen.queryByText(/beautifully designed space/i)).not.toBeInTheDocument();
  });

  it('shows placeholder image when no cover URL is available', () => {
    render(
      <ImageDetailView
        project={{ ...project, coverImageUrl: null }}
        gallery={[]}
        designer={designer}
        narrative={null}
        similarProjects={[]}
        activeImageId="nonexistent"
      />,
    );

    // Should not crash and should still show the title
    expect(screen.getAllByText('Sunlit Bandra Apartment').length).toBeGreaterThan(0);
  });

  it('redirects to login when unauthenticated user clicks bookmark', () => {
    render(
      <ImageDetailView
        project={project}
        gallery={gallery}
        designer={designer}
        narrative={null}
        similarProjects={[]}
        activeImageId={gallery[0]!.id}
        isAuthenticated={false}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /bookmark/i }));
    expect(push).toHaveBeenCalledWith(`/login?next=/image/${gallery[0]!.id}`);
  });

  it('calls saved-projects API when authenticated user clicks bookmark', () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ projectId: project.id, saved: true }),
    } as never);

    render(
      <ImageDetailView
        project={project}
        gallery={gallery}
        designer={designer}
        narrative={null}
        similarProjects={[]}
        activeImageId={gallery[0]!.id}
        isAuthenticated={true}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /bookmark/i }));

    // Should call the save API
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining(`/api/saved-projects/${project.id}`),
      expect.objectContaining({ method: 'PUT' }),
    );
  });

  it('does not display fabricated views or bookmark counts', () => {
    render(
      <ImageDetailView
        project={project}
        gallery={gallery}
        designer={designer}
        narrative={null}
        similarProjects={[]}
        activeImageId={gallery[0]!.id}
      />,
    );

    // Should not have the old fake views count (Eye icon + reviewCount)
    const eyeIcons = document.querySelectorAll('.lucide-eye');
    expect(eyeIcons).toHaveLength(0);
  });

  it('does not render a Report button', () => {
    render(
      <ImageDetailView
        project={project}
        gallery={gallery}
        designer={designer}
        narrative={null}
        similarProjects={[]}
        activeImageId={gallery[0]!.id}
      />,
    );

    expect(screen.queryByRole('button', { name: /report/i })).not.toBeInTheDocument();
  });
});
