import { describe, expect, it } from 'vitest';
import { publicMetadata } from '@/lib/social-metadata';

describe('public sharing metadata', () => {
  it('uses stable absolute application URLs for canonical, Open Graph and Twitter', () => {
    const metadata = publicMetadata({
      title: 'Maison Élan',
      description: 'A warm home',
      path: '/projects/123',
      imagePath: '/projects/123/social-card',
      type: 'article',
    });
    expect(metadata.alternates?.canonical).toBe('http://localhost:3000/projects/123');
    expect(metadata.openGraph).toMatchObject({
      title: 'Maison Élan',
      url: 'http://localhost:3000/projects/123',
      images: [
        {
          url: 'http://localhost:3000/projects/123/social-card',
          width: 1200,
          height: 630,
          alt: 'Maison Élan',
        },
      ],
    });
    expect(metadata.twitter).toMatchObject({
      card: 'summary_large_image',
      images: [{ url: 'http://localhost:3000/projects/123/social-card', alt: 'Maison Élan' }],
    });
    expect(metadata.robots).toEqual({ index: true, follow: true });
  });
});
