import { ImageResponse } from 'next/og';
import { PublicSocialCard } from '@/components/public-social-card';
import { HOME_SOCIAL_COPY, SOCIAL_IMAGE_SIZE } from '@/lib/social-metadata';

export function GET() {
  return new ImageResponse(<PublicSocialCard {...HOME_SOCIAL_COPY} />, {
    ...SOCIAL_IMAGE_SIZE,
    headers: {
      'Cache-Control': 'public, max-age=3600, must-revalidate',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
