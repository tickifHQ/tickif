import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CurrentProfileResponse } from '@repo/contracts';

const mock = vi.hoisted(() => ({
  getProfileCompletion: vi.fn(),
  requireCurrentDesignerProfile: vi.fn(),
  taxonomyGet: vi.fn(),
}));

vi.mock('@/lib/designer-profile', () => ({
  getProfileCompletion: mock.getProfileCompletion,
  requireCurrentDesignerProfile: mock.requireCurrentDesignerProfile,
}));

vi.mock('@/lib/api', () => ({
  api: {
    api: {
      taxonomy: { terms: { $get: mock.taxonomyGet } },
    },
  },
}));

const selectedCity = {
  id: '11111111-1111-4111-8111-111111111111',
  kind: 'city' as const,
  label: 'Mumbai',
  slug: 'mumbai',
  parentId: null,
};

const profile: CurrentProfileResponse = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  orgId: 'org-1',
  displayName: 'Mahi Studio',
  entityType: 'individual',
  bio: null,
  logoImageId: null,
  status: 'draft',
  yearsExperience: 0,
  projectCount: 0,
  shareCount: 0,
  avgRating: '0',
  reviewCount: 0,
  websiteUrl: null,
  googleBusinessUrl: null,
  phone: null,
  address: null,
  instagramHandle: null,
  linkedinHandle: null,
  youtubeHandle: null,
  firmType: null,
  foundedYear: null,
  staffCount: null,
  testimonialBannerEnabled: false,
  footprint: [selectedCity],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  organization: { id: 'org-1', name: 'Mahi Studio', slug: 'mahi-studio' },
  shareUrl: 'https://tickif.example.com/d/mahi-studio',
};

describe('profile editor SSR data', () => {
  beforeEach(() => {
    mock.getProfileCompletion.mockReset();
    mock.requireCurrentDesignerProfile.mockReset();
    mock.taxonomyGet.mockReset();

    mock.requireCurrentDesignerProfile.mockResolvedValue(profile);
    mock.getProfileCompletion.mockResolvedValue({
      ok: true,
      data: { steps: [], score: 60, missing: ['Add a bio'] },
    });
    mock.taxonomyGet.mockImplementation(
      async ({ query }: { query: { kind: string } }) =>
        new Response(
          JSON.stringify({
            terms:
              query.kind === 'city'
                ? [{ id: selectedCity.id, label: 'Mumbai', slug: 'mumbai', parentId: null }]
                : [],
          }),
          { status: 200 },
        ),
    );
  });

  it('loads profile, completion, and all footprint axes for the server-rendered page', async () => {
    const { getProfileEditorPageData } = await import('../../src/lib/profile-editor-data');

    const result = await getProfileEditorPageData();

    expect(result.profile).toEqual(profile);
    expect(result.completion?.score).toBe(60);
    expect(result.taxonomy.cities).toEqual([
      { id: selectedCity.id, label: 'Mumbai' },
    ]);
    expect(result.taxonomyError).toBeNull();
    expect(mock.taxonomyGet).toHaveBeenCalledTimes(3);
    expect(mock.taxonomyGet).toHaveBeenCalledWith({ query: { kind: 'city' } });
    expect(mock.taxonomyGet).toHaveBeenCalledWith({ query: { kind: 'scope' } });
    expect(mock.taxonomyGet).toHaveBeenCalledWith({ query: { kind: 'theme' } });
    expect(mock.getProfileCompletion).toHaveBeenCalledOnce();
  });

  it('preserves selected profile terms when a taxonomy request fails', async () => {
    mock.taxonomyGet.mockResolvedValue(new Response(null, { status: 503 }));
    const { getProfileEditorPageData } = await import('../../src/lib/profile-editor-data');

    const result = await getProfileEditorPageData();

    expect(result.taxonomy.cities).toContainEqual({
      id: selectedCity.id,
      label: 'Mumbai',
    });
    expect(result.taxonomyError).toMatch(/existing selections are preserved/i);
  });

  it('prefers the current taxonomy label over a stored profile snapshot', async () => {
    mock.taxonomyGet.mockImplementation(
      async ({ query }: { query: { kind: string } }) =>
        new Response(
          JSON.stringify({
            terms:
              query.kind === 'city'
                ? [{ id: selectedCity.id, label: 'Bombay', slug: 'mumbai', parentId: null }]
                : [],
          }),
          { status: 200 },
        ),
    );
    const { getProfileEditorPageData } = await import('../../src/lib/profile-editor-data');

    const result = await getProfileEditorPageData();

    expect(result.taxonomy.cities).toEqual([{ id: selectedCity.id, label: 'Bombay' }]);
  });

  it('reports completion loading failures instead of silently hiding the state', async () => {
    mock.getProfileCompletion.mockResolvedValue({
      ok: false,
      data: null,
      message: 'Could not load profile completion.',
    });
    const { getProfileEditorPageData } = await import('../../src/lib/profile-editor-data');

    const result = await getProfileEditorPageData();

    expect(result.completion).toBeNull();
    expect(result.completionError).toBe('Could not load profile completion.');
  });
});
