import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makePublicPortfolio } from '../../fixtures/public-portfolio';

const mock = vi.hoisted(() => ({
  fetchPublicPortfolio: vi.fn(),
  imageResponse: vi.fn(),
  socialImageData: vi.fn(),
}));

vi.mock('@/lib/public-portfolio-api', () => ({
  fetchPublicPortfolio: mock.fetchPublicPortfolio,
}));

vi.mock('@/lib/social-image', () => ({
  socialImageData: mock.socialImageData,
  SOCIAL_IMAGE_HEADERS: { 'Cache-Control': 'private, no-store, max-age=0' },
}));

vi.mock('next/og', () => ({
  ImageResponse: class extends Response {
    constructor(element: unknown, options: { width: number; height: number }) {
      super('generated image', { headers: { 'content-type': 'image/png' } });
      mock.imageResponse(element, options);
    }
  },
}));

const { GET } = await import('../../../app/(public-profile)/d/[slug]/social-card/route');

describe('/d/[slug]/social-card', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.socialImageData.mockResolvedValue(null);
  });

  it('renders a 1200 by 630 PNG for a published portfolio', async () => {
    mock.fetchPublicPortfolio.mockResolvedValue(makePublicPortfolio());

    const response = await GET(new Request('http://localhost/d/anika-spaces/social-card'), {
      params: Promise.resolve({ slug: 'anika-spaces' }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(mock.fetchPublicPortfolio).toHaveBeenCalledWith('anika-spaces');
    expect(mock.imageResponse).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ width: 1200, height: 630 }),
    );
    expect(mock.socialImageData).toHaveBeenCalledWith(makePublicPortfolio().heroCoverUrl);
    expect(mock.imageResponse.mock.calls[0]?.[1].fonts).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'Inter', weight: 400 })]),
    );
  });

  it('passes only safely embedded logo and cover data to the renderer', async () => {
    const portfolio = makePublicPortfolio({ logoUrl: 'https://storage.example/logo.png' });
    mock.fetchPublicPortfolio.mockResolvedValue(portfolio);
    mock.socialImageData.mockImplementation(async (url: string) =>
      url === portfolio.logoUrl ? 'data:image/png;base64,logo' : 'data:image/png;base64,cover',
    );
    await GET(new Request('http://localhost/d/anika-spaces/social-card'), {
      params: Promise.resolve({ slug: 'anika-spaces' }),
    });
    expect(mock.imageResponse.mock.calls[0]?.[0].props.portfolio).toMatchObject({
      logoUrl: 'data:image/png;base64,logo',
      heroCoverUrl: 'data:image/png;base64,cover',
    });
  });

  it('returns 404 when the portfolio is not public', async () => {
    mock.fetchPublicPortfolio.mockResolvedValue(null);

    const response = await GET(new Request('http://localhost/d/private/social-card'), {
      params: Promise.resolve({ slug: 'private' }),
    });

    expect(response.status).toBe(404);
    await expect(response.text()).resolves.toBe('Portfolio not found');
    expect(mock.imageResponse).not.toHaveBeenCalled();
  });
});
