import { ImageResponse } from 'next/og';
import { PublicPortfolioSocialCard } from '@/components/public-portfolio-social-card';
import { fetchPublicPortfolio } from '@/lib/public-portfolio-api';

const size = { width: 1200, height: 630 };

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const portfolio = await fetchPublicPortfolio(slug);
  if (!portfolio) {
    return new Response('Portfolio not found', { status: 404 });
  }

  return new ImageResponse(<PublicPortfolioSocialCard portfolio={portfolio} />, size);
}
