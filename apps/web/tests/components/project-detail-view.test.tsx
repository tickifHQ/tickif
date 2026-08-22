import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublicProjectGalleryImage, PublicProjectDesigner, PublicImageDetailProject } from '@repo/contracts';
import { ImageDetailView } from '../../src/components/image-detail-view';

const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

vi.mock('@/env', () => ({
  env: { NEXT_PUBLIC_API_URL: 'http://localhost:8008' },
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const project: PublicImageDetailProject = {
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
  buildingName: 'Sunlit Towers',
  specifications: {
    propertyType: null,
    propertySubtype: null,
    scope: null,
    bhk: null,
    budgetBand: null,
    city: { slug: 'mumbai', label: 'Mumbai' },
    locality: { slug: 'bandra', label: 'Bandra' },
  },
};

const designer: PublicProjectDesigner = {
  id: '44444444-4444-4444-8444-444444444444',
  displayName: 'Studio A',
  slug: 'studio-a',
  avgRating: '4.5',
  reviewCount: 10,
  entityType: 'company',
  logoUrl: null,
  isKycVerified: false,
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
  // A third image is required so ArrowLeft and ArrowRight resolve to different
  // targets — with only two, both directions land on index 1 and the
  // wrap-around arithmetic is untestable.
  {
    id: '55555555-5555-4555-8555-555555555555',
    url: 'https://images.example.com/bedroom.jpg',
    width: 800,
    height: 600,
    roomId: null,
    roomName: 'Bedroom',
    sortOrder: 2,
    themes: [],
    materials: [],
    finishes: [],
    tags: [],
  },
];

function renderComponent(overrides: Partial<Parameters<typeof ImageDetailView>[0]> = {}) {
  return render(
    <ImageDetailView
      project={project}
      gallery={gallery}
      designer={designer}
      narrative={null}
      moreProjects={[]}
      activeImageId={gallery[0]!.id}
      designerProfileId={designer.id}
      isAuthenticated={false}
      {...overrides}
    />,
  );
}

describe('ImageDetailView', () => {
  beforeEach(() => {
    push.mockClear();
    mockFetch.mockReset();
    // Default mock: saved-state returns empty, view tracking succeeds
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ savedProjectIds: [], recorded: true }),
    });
  });

  afterEach(() => {
    // Drop any navigator.share / navigator.clipboard stubs installed by the
    // share tests so they cannot leak into later cases.
    Reflect.deleteProperty(navigator, 'share');
    Reflect.deleteProperty(navigator, 'clipboard');
    vi.restoreAllMocks();
  });

  // --- Core rendering ---

  it('renders the enquiry CTA with inverted styling and callbackURL', () => {
    renderComponent();

    const enquire = screen.getByRole('link', { name: /enquire/i });
    expect(enquire).toHaveClass('h-9', 'bg-button-inverted', 'text-button-inverted-foreground');
    expect(enquire).toHaveAttribute(
      'href',
      expect.stringContaining('/login?callbackURL='),
    );
  });

  it('displays the real project description', () => {
    renderComponent();

    expect(screen.getByText('A modern apartment with clean lines and natural light.')).toBeInTheDocument();
    expect(screen.queryByText(/beautifully designed space/i)).not.toBeInTheDocument();
  });

  it('shows placeholder when no image URL is available', () => {
    renderComponent({ gallery: [], activeImageId: 'nonexistent' });

    // Assert the placeholder branch itself, not just the title (which the hero
    // overlay and breadcrumb render either way).
    expect(screen.getByTestId('image-placeholder')).toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();
  });

  it('falls back to the project cover image when the gallery is empty', () => {
    renderComponent({
      gallery: [],
      activeImageId: 'nonexistent',
      project: { ...project, coverImageUrl: 'https://images.example.com/cover.jpg' },
    });

    expect(screen.queryByTestId('image-placeholder')).not.toBeInTheDocument();
    expect(document.querySelector('img')).toHaveAttribute(
      'src',
      'https://images.example.com/cover.jpg',
    );
  });

  it('links to the full project route', () => {
    renderComponent();

    expect(screen.getByRole('link', { name: /visit full project/i })).toHaveAttribute(
      'href',
      `/projects/${project.id}`,
    );
  });

  // --- Finding #2: Login redirect uses callbackURL ---

  it('redirects to login with callbackURL when anonymous user clicks bookmark', () => {
    renderComponent({ isAuthenticated: false });

    fireEvent.click(screen.getByRole('button', { name: /bookmark/i }));
    expect(push).toHaveBeenCalledWith(
      expect.stringMatching(/\/login\?callbackURL=%2Fimage%2F/),
    );
  });

  // --- Finding #6: View profile link ---

  it('links the View profile button to the designer portfolio when slug exists', () => {
    renderComponent();

    expect(screen.getByRole('link', { name: /view profile/i })).toHaveAttribute(
      'href',
      '/d/studio-a',
    );
  });

  it('renders disabled View profile when designer.slug is null', () => {
    renderComponent({ designer: { ...designer, slug: null } });

    expect(screen.queryByRole('link', { name: /view profile/i })).not.toBeInTheDocument();
    expect(screen.getByText('View profile')).toHaveAttribute('aria-disabled', 'true');
  });

  // --- Finding #8: No fabricated rating ---

  it('does not show rating when designer has zero reviews', () => {
    renderComponent({
      designer: { ...designer, avgRating: '0', reviewCount: 0 },
    });

    expect(screen.queryByText('0.0')).not.toBeInTheDocument();
    expect(screen.queryByText('0 reviews')).not.toBeInTheDocument();
    expect(screen.getByText('12 projects')).toBeInTheDocument();
  });

  it('does not render a Verified badge', () => {
    renderComponent();

    expect(screen.queryByLabelText('Verified')).not.toBeInTheDocument();
  });

  it('does not render a Report button', () => {
    renderComponent();

    expect(screen.queryByRole('button', { name: /report/i })).not.toBeInTheDocument();
  });

  it('does not display fabricated views or bookmark counts', () => {
    renderComponent();

    const eyeIcons = document.querySelectorAll('.lucide-eye');
    expect(eyeIcons).toHaveLength(0);
  });

  // --- Finding #1: Keyboard navigation ---

  it('navigates gallery forward with ArrowRight key', () => {
    renderComponent({ activeImageId: gallery[1]!.id });

    fireEvent.keyDown(document, { key: 'ArrowRight' });
    expect(push).toHaveBeenCalledWith(`/image/${gallery[2]!.id}`, { scroll: false });
  });

  it('navigates gallery backward with ArrowLeft key', () => {
    renderComponent({ activeImageId: gallery[1]!.id });

    fireEvent.keyDown(document, { key: 'ArrowLeft' });
    expect(push).toHaveBeenCalledWith(`/image/${gallery[0]!.id}`, { scroll: false });
  });

  it('wraps to the last image when ArrowLeft is pressed on the first', () => {
    renderComponent({ activeImageId: gallery[0]!.id });

    fireEvent.keyDown(document, { key: 'ArrowLeft' });
    expect(push).toHaveBeenCalledWith(
      `/image/${gallery[gallery.length - 1]!.id}`,
      { scroll: false },
    );
  });

  it('wraps to the first image when ArrowRight is pressed on the last', () => {
    renderComponent({ activeImageId: gallery[gallery.length - 1]!.id });

    fireEvent.keyDown(document, { key: 'ArrowRight' });
    expect(push).toHaveBeenCalledWith(`/image/${gallery[0]!.id}`, { scroll: false });
  });

  it('does NOT navigate when arrow key is inside an input', () => {
    renderComponent();

    const input = document.createElement('input');
    document.body.appendChild(input);
    fireEvent.keyDown(input, { key: 'ArrowRight' });

    expect(push).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });

  it('does NOT navigate on repeated key events', () => {
    renderComponent();

    fireEvent.keyDown(document, { key: 'ArrowRight', repeat: true });
    expect(push).not.toHaveBeenCalled();
  });

  it('does NOT navigate with modifier keys (Alt+Arrow)', () => {
    renderComponent();

    fireEvent.keyDown(document, { key: 'ArrowLeft', altKey: true });
    expect(push).not.toHaveBeenCalled();
  });

  // --- Gallery thumbnail routing ---

  it('routes each selected thumbnail to its own image detail URL', () => {
    renderComponent();

    fireEvent.click(screen.getByRole('button', { name: /kitchen/i }));
    expect(push).toHaveBeenCalledWith(`/image/${gallery[1]!.id}`, { scroll: false });
  });

  // --- Finding #5 + Bookmark API ---

  it('calls saved-projects API when authenticated user clicks bookmark', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ projectId: project.id, saved: true, savedProjectIds: [] }),
    });

    await act(async () => {
      renderComponent({ isAuthenticated: true });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /bookmark/i }));
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining(`/api/saved-projects/${project.id}`),
      expect.objectContaining({ method: 'PUT' }),
    );
  });

  it('reverts bookmark state when API call fails', async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes('/api/saved-projects/state')) {
        return { ok: true, json: async () => ({ savedProjectIds: [] }) };
      }
      if (url.includes('/api/saved-projects/')) {
        return { ok: false, status: 500 };
      }
      return { ok: true, json: async () => ({ recorded: true }) };
    });

    await act(async () => {
      renderComponent({ isAuthenticated: true });
    });

    const bookmarkBtn = screen.getByRole('button', { name: /bookmark/i });

    await act(async () => {
      fireEvent.click(bookmarkBtn);
    });

    // After failure, should revert to unsaved
    await waitFor(() => {
      expect(bookmarkBtn).toHaveAttribute('aria-pressed', 'false');
    });
  });

  // --- Share ---

  function stubNavigator(props: Record<string, unknown>) {
    for (const [key, value] of Object.entries(props)) {
      Object.defineProperty(navigator, key, { value, configurable: true, writable: true });
    }
  }

  it('prefers the Web Share API when it is available', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubNavigator({ share, clipboard: { writeText } });

    renderComponent();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /share/i }));
    });

    expect(share).toHaveBeenCalledWith({
      title: project.title,
      url: `${window.location.origin}/image/${gallery[0]!.id}`,
    });
    expect(writeText).not.toHaveBeenCalled();
  });

  it('falls back to the clipboard when Web Share is unavailable', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubNavigator({ share: undefined, clipboard: { writeText } });

    renderComponent();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /share/i }));
    });

    expect(writeText).toHaveBeenCalledWith(
      `${window.location.origin}/image/${gallery[0]!.id}`,
    );
  });

  it('does not raise when neither share nor clipboard exists (insecure context)', async () => {
    // Over plain http both APIs are undefined. The old code dereferenced
    // navigator.clipboard.writeText, which React surfaces as an unhandled
    // error rather than a synchronous throw out of fireEvent.
    stubNavigator({ share: undefined, clipboard: undefined });
    const onError = vi.fn();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    window.addEventListener('error', onError);

    try {
      renderComponent();

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /share/i }));
      });

      expect(onError).not.toHaveBeenCalled();
      expect(consoleError).not.toHaveBeenCalled();
      expect(push).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('error', onError);
      consoleError.mockRestore();
    }
  });

  // --- View tracking identity ---

  it('reuses a persisted anonymousId across page views but a fresh eventKey', async () => {
    window.localStorage.clear();
    const viewBodies: Array<Record<string, unknown>> = [];
    mockFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (String(url).includes('/api/interactions/views')) {
        viewBodies.push(JSON.parse(String(init?.body)));
        return { ok: true, json: async () => ({ recorded: true }) };
      }
      return { ok: true, json: async () => ({ savedProjectIds: [] }) };
    });

    await act(async () => {
      renderComponent({ isAuthenticated: true });
    });
    await act(async () => {
      renderComponent({ isAuthenticated: true });
    });

    expect(viewBodies).toHaveLength(2);
    expect(viewBodies[0]!.anonymousId).toBe(viewBodies[1]!.anonymousId);
    expect(viewBodies[0]!.eventKey).not.toBe(viewBodies[1]!.eventKey);
  });

  // --- Finding #7: Gallery accessibility ---

  it('uses aria-current for the active gallery image (not role=tab)', () => {
    renderComponent();

    const buttons = screen.getAllByRole('button', { name: /living room|kitchen/i });
    const activeButton = buttons.find(
      (btn) => btn.getAttribute('aria-current') === 'true',
    );
    expect(activeButton).toBeDefined();

    // Should NOT use role="tab"
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });
});
