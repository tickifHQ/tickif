import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PortfolioResponse } from '@repo/contracts';
import {
  checkSlugAvailability,
  deleteLogo,
  fetchPortfolio,
  updatePortfolio,
  uploadLogo,
} from '../../src/lib/portfolio-api';

const mock = vi.hoisted(() => ({
  portfolioGet: vi.fn(),
  portfolioPatch: vi.fn(),
  slugCheckPost: vi.fn(),
  logoUploadPost: vi.fn(),
  logoCommitPost: vi.fn(),
  logoDelete: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  api: {
    api: {
      profiles: {
        me: {
          portfolio: {
            $get: mock.portfolioGet,
            $patch: mock.portfolioPatch,
            'slug-check': { $post: mock.slugCheckPost },
            logo: {
              $delete: mock.logoDelete,
              upload: { $post: mock.logoUploadPost },
              commit: { $post: mock.logoCommitPost },
            },
          },
        },
      },
    },
  },
}));

const portfolio: PortfolioResponse = {
  id: '11111111-1111-4111-8111-111111111111',
  publicLinkEnabled: true,
  portfolioSlug: 'mahi-studio',
  accentColor: '#FF8F73',
  showHero: true,
  showTrustCredentials: true,
  showFeaturedTestimonial: true,
  showReviews: true,
  showSocialLinks: true,
  showShareBlock: true,
  tagline: 'Design with care',
  displayName: 'Mahi Studio',
  bio: 'Interiors for real life.',
  logoUrl: null,
  websiteUrl: 'https://mahistudio.com',
  instagramHandle: '@mahistudio',
  linkedinHandle: '/company/mahistudio',
  youtubeHandle: '@mahistudio',
  testimonialWords: 'Loved working with them.',
  testimonialAuthor: 'Priya K',
  testimonialProjectId: null,
  showOverallRating: true,
  showPositiveReviewsOnly: false,
  showTickifBadge: true,
  badges: ['verified'],
  portfolioUrl: 'https://tickif.com/d/mahi-studio',
  googleConnection: null,
  publishedAt: null,
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
};

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body };
}

describe('portfolio-api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('fetchPortfolio', () => {
    it('returns the parsed portfolio on success', async () => {
      mock.portfolioGet.mockResolvedValue(jsonResponse(portfolio));

      await expect(fetchPortfolio()).resolves.toEqual(portfolio);
      expect(mock.portfolioGet).toHaveBeenCalledTimes(1);
    });

    it('surfaces per-field validation details from a 422 envelope, capped at three', async () => {
      mock.portfolioGet.mockResolvedValue(
        jsonResponse(
          {
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Request validation failed',
              details: [
                { path: 'portfolioSlug', message: 'Lowercase letters, numbers, and hyphens only' },
                { path: '', message: 'Something is off' },
                { path: 'tagline', message: 'Too long' },
                { path: 'bio', message: 'Fourth detail never shown' },
              ],
            },
          },
          false,
        ),
      );

      await expect(fetchPortfolio()).rejects.toThrow(
        'portfolioSlug: Lowercase letters, numbers, and hyphens only; Something is off; tagline: Too long',
      );
    });

    it('falls back to the envelope message when there are no details', async () => {
      mock.portfolioGet.mockResolvedValue(
        jsonResponse({ error: { code: 'NOT_FOUND', message: 'Profile not found' } }, false),
      );

      await expect(fetchPortfolio()).rejects.toThrow('Profile not found');
    });

    it('uses the generic fallback for a non-JSON error response', async () => {
      mock.portfolioGet.mockResolvedValue({
        ok: false,
        json: async () => {
          throw new SyntaxError('Unexpected token < in JSON');
        },
      });

      await expect(fetchPortfolio()).rejects.toThrow('Could not load portfolio settings.');
    });
  });

  describe('updatePortfolio', () => {
    it('sends the patch body as json and returns the updated portfolio', async () => {
      const updated = { ...portfolio, tagline: 'New tagline' };
      mock.portfolioPatch.mockResolvedValue(jsonResponse(updated));

      await expect(updatePortfolio({ tagline: 'New tagline' })).resolves.toEqual(updated);
      expect(mock.portfolioPatch).toHaveBeenCalledWith({ json: { tagline: 'New tagline' } });
    });

    it('throws the save fallback on an unrecognized error body', async () => {
      mock.portfolioPatch.mockResolvedValue(jsonResponse({ unexpected: true }, false));

      await expect(updatePortfolio({ tagline: null })).rejects.toThrow(
        'Could not save portfolio settings.',
      );
    });
  });

  describe('checkSlugAvailability', () => {
    it('posts the slug and returns availability', async () => {
      mock.slugCheckPost.mockResolvedValue(jsonResponse({ slug: 'my-studio', available: true }));

      await expect(checkSlugAvailability('my-studio')).resolves.toEqual({
        slug: 'my-studio',
        available: true,
      });
      expect(mock.slugCheckPost).toHaveBeenCalledWith({ json: { slug: 'my-studio' } });
    });
  });

  describe('uploadLogo', () => {
    const file = new File([new Uint8Array([1, 2, 3, 4])], 'logo.png', { type: 'image/png' });

    it('presigns, PUTs to storage, then commits the object key', async () => {
      mock.logoUploadPost.mockResolvedValue(
        jsonResponse({
          uploadUrl: 'https://storage.example.com/presigned-put',
          key: 'originals/logos/profile-1/object-1',
        }),
      );
      const storagePut = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal('fetch', storagePut);
      mock.logoCommitPost.mockResolvedValue(
        jsonResponse({ logoUrl: 'https://cdn.example.com/logo.png' }),
      );

      await expect(uploadLogo(file)).resolves.toEqual({
        logoUrl: 'https://cdn.example.com/logo.png',
      });

      expect(mock.logoUploadPost).toHaveBeenCalledWith({
        json: { contentType: 'image/png', contentLength: file.size },
      });
      expect(storagePut).toHaveBeenCalledWith('https://storage.example.com/presigned-put', {
        method: 'PUT',
        headers: { 'Content-Type': 'image/png' },
        body: file,
      });
      expect(mock.logoCommitPost).toHaveBeenCalledWith({
        json: { objectKey: 'originals/logos/profile-1/object-1' },
      });
    });

    it('aborts before commit when the storage PUT fails', async () => {
      mock.logoUploadPost.mockResolvedValue(
        jsonResponse({
          uploadUrl: 'https://storage.example.com/presigned-put',
          key: 'originals/logos/profile-1/object-1',
        }),
      );
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));

      await expect(uploadLogo(file)).rejects.toThrow('Could not upload logo to storage.');
      expect(mock.logoCommitPost).not.toHaveBeenCalled();
    });

    it('stops at presign failure without touching storage', async () => {
      mock.logoUploadPost.mockResolvedValue(
        jsonResponse({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'File exceeds 5 MB' } }, false),
      );
      const storagePut = vi.fn();
      vi.stubGlobal('fetch', storagePut);

      await expect(uploadLogo(file)).rejects.toThrow('File exceeds 5 MB');
      expect(storagePut).not.toHaveBeenCalled();
      expect(mock.logoCommitPost).not.toHaveBeenCalled();
    });
  });

  describe('deleteLogo', () => {
    it('resolves on a bodyless success response', async () => {
      mock.logoDelete.mockResolvedValue({
        ok: true,
        json: async () => {
          throw new SyntaxError('no body');
        },
      });

      await expect(deleteLogo()).resolves.toBeUndefined();
    });

    it('extracts the envelope message on failure', async () => {
      mock.logoDelete.mockResolvedValue(
        jsonResponse({ error: { code: 'NOT_FOUND', message: 'No logo to delete' } }, false),
      );

      await expect(deleteLogo()).rejects.toThrow('No logo to delete');
    });
  });
});
