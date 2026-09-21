import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makePublicPortfolio } from '../../fixtures/public-portfolio';

const mock = vi.hoisted(() => ({
  fetchPublicPortfolio: vi.fn(),
  imageResponse: vi.fn(),
}));

vi.mock('@/lib/public-portfolio-api', () => ({
  fetchPublicPortfolio: mock.fetchPublicPortfolio,
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
