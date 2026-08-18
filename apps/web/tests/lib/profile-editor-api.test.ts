import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProfileOwnerResponse } from '@repo/contracts';

const mock = vi.hoisted(() => ({
  completionGet: vi.fn(),
  profilePatch: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  api: {
    api: {
      profiles: {
        me: {
          $patch: mock.profilePatch,
          completion: { $get: mock.completionGet },
        },
      },
    },
  },
}));

const profile: ProfileOwnerResponse = {
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
  footprint: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('profile editor API', () => {
  beforeEach(() => {
    mock.completionGet.mockReset();
    mock.profilePatch.mockReset();
  });

  it('updates the current profile through the typed endpoint', async () => {
    mock.profilePatch.mockResolvedValue(new Response(JSON.stringify(profile), { status: 200 }));
    const { updateDesignerProfile } = await import('../../src/lib/profile-editor-api');

    await expect(updateDesignerProfile({ displayName: 'Mahi Studio' })).resolves.toEqual(profile);
    expect(mock.profilePatch).toHaveBeenCalledWith({ json: { displayName: 'Mahi Studio' } });
  });

  it('surfaces structured API validation details', async () => {
    mock.profilePatch.mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            message: 'Request validation failed',
            details: [{ path: 'websiteUrl', message: 'Invalid URL' }],
          },
        }),
        { status: 422 },
      ),
    );
    const { updateDesignerProfile } = await import('../../src/lib/profile-editor-api');

    await expect(updateDesignerProfile({ websiteUrl: 'not-a-url' })).rejects.toThrow(
      'websiteUrl: Invalid URL',
    );
  });

  it('refreshes and validates the completion score', async () => {
    const completion = { steps: [], score: 75, missing: ['Publish a project'] };
    mock.completionGet.mockResolvedValue(new Response(JSON.stringify(completion), { status: 200 }));
    const { fetchProfileCompletion } = await import('../../src/lib/profile-editor-api');

    await expect(fetchProfileCompletion()).resolves.toEqual(completion);
  });
});
