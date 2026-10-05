import { ImageResponse } from 'next/og';
import { PublicSocialCard } from '@/components/public-social-card';
import { getBlogPost } from '@/lib/blog';
import { SOCIAL_IMAGE_HEADERS } from '@/lib/social-image';
import { SOCIAL_IMAGE_SIZE } from '@/lib/social-metadata';

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getBlogPost(slug);
  if (!post)
    return new Response('Article not found', { status: 404, headers: SOCIAL_IMAGE_HEADERS });
  return new ImageResponse(
    <PublicSocialCard
      title={post.title}
      description={post.description}
      eyebrow="The Tickif journal"
    />,
    { ...SOCIAL_IMAGE_SIZE, headers: SOCIAL_IMAGE_HEADERS },
  );
}
