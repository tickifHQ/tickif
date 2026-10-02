import type { Metadata } from 'next';
import { env } from '@/env';

export const SOCIAL_IMAGE_SIZE = { width: 1200, height: 630 };

export function publicUrl(path: string): string {
  return new URL(path, env.NEXT_PUBLIC_WEB_URL).toString();
}

/** Share application endpoints, never expiring media-storage signatures. */
export function publicMetadata({
  title,
  description,
  path,
  imagePath = '/social-card',
  type = 'website',
}: {
  title: string;
  description: string;
  path: string;
  imagePath?: string;
  type?: 'website' | 'article' | 'profile';
}): Metadata {
  const url = publicUrl(path);
  const image = { url: publicUrl(imagePath), ...SOCIAL_IMAGE_SIZE, alt: title };
  return {
    title: `${title} | Tickif`,
    description,
    alternates: { canonical: url },
    robots: { index: true, follow: true },
    openGraph: { type, title, description, url, siteName: 'Tickif', images: [image] },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [{ url: image.url, alt: title }],
    },
  };
}

export const HOME_SOCIAL_COPY = {
  title: 'Inspire from real homes you’ll love.',
  description:
    'Explore real homes and discover architecture, construction and interior design professionals on Tickif.',
};
export const DESIGNERS_SOCIAL_COPY = {
  title: 'Find interior designers',
  description:
    'Discover designers and studios by city, style and experience. Explore their published portfolios on Tickif.',
};
export const BLOG_SOCIAL_COPY = {
  title: 'Journal',
  description: 'Ideas and practical guides for planning a space with a designer.',
};
