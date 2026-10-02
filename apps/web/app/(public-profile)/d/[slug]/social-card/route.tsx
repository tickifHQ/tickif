import { ImageResponse } from 'next/og';
import { PublicPortfolioSocialCard } from '@/components/public-portfolio-social-card';
import { fetchPublicPortfolio } from '@/lib/public-portfolio-api';
import { socialImageData, SOCIAL_IMAGE_HEADERS } from '@/lib/social-image';
import { SOCIAL_IMAGE_SIZE } from '@/lib/social-metadata';

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const portfolio = await fetchPublicPortfolio(slug);
  if (!portfolio) {
    return new Response('Portfolio not found', { status: 404, headers: SOCIAL_IMAGE_HEADERS });
  }

  const logoUrl = await socialImageData(portfolio.logoUrl);
  return new ImageResponse(<PublicPortfolioSocialCard portfolio={{ ...portfolio, logoUrl }} />, {
    ...SOCIAL_IMAGE_SIZE,
    headers: SOCIAL_IMAGE_HEADERS,
  });
}
