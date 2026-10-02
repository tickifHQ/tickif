import { ImageResponse } from 'next/og';
import { PublicSocialCard } from '@/components/public-social-card';
import { fetchPublicImage } from '@/lib/public-project-api';
import { socialImageData, SOCIAL_IMAGE_HEADERS } from '@/lib/social-image';
import { SOCIAL_IMAGE_SIZE } from '@/lib/social-metadata';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await fetchPublicImage(id);
  if (!detail)
    return new Response('Image not found', { status: 404, headers: SOCIAL_IMAGE_HEADERS });
  const [image, logo] = await Promise.all([
    socialImageData(detail.activeImage.url),
    socialImageData(detail.designer.logoUrl),
  ]);
  return new ImageResponse(
    <PublicSocialCard
      title={detail.project.title}
      eyebrow={detail.activeImage.roomName ?? 'A published space on Tickif'}
      image={image}
      studio={detail.designer.displayName}
      logo={logo}
    />,
    { ...SOCIAL_IMAGE_SIZE, headers: SOCIAL_IMAGE_HEADERS },
  );
}
