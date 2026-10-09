import { ImageResponse } from 'next/og';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { PublicPortfolioSocialCard } from '@/components/public-portfolio-social-card';
import { portfolioSocialFonts } from '@/lib/portfolio-social-fonts';
import { SOCIAL_IMAGE_SIZE } from '@/lib/social-metadata';
import { makePublicPortfolio } from '../../fixtures/public-portfolio';

describe('portfolio OG raster rendering', () => {
  it.each(['Maison Élan', 'W'.repeat(100)])(
    'renders %s with bundled fonts and missing-media fallback',
    async (displayName) => {
      const response = new ImageResponse(
        <PublicPortfolioSocialCard
          portfolio={makePublicPortfolio({ displayName, logoUrl: null, heroCoverUrl: null })}
        />,
        { ...SOCIAL_IMAGE_SIZE, fonts: await portfolioSocialFonts() },
      );
      const png = Buffer.from(await response.arrayBuffer());
      expect(await sharp(png).metadata()).toMatchObject({
        format: 'png',
        width: 1200,
        height: 630,
      });
      const { data, info } = await sharp(png)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const alphaAt = (x: number, y: number) => data[(y * info.width + x) * info.channels + 3];
      // The card fills the canvas, with transparency only at its rounded corners.
      expect(alphaAt(0, 0)).toBe(0);
      for (const [x, y] of [
        [600, 0],
        [600, 629],
        [0, 315],
        [1199, 315],
      ] as const) {
        expect(alphaAt(x, y)).toBe(255);
      }
      // In this no-cover fixture the stats start at (48,172), with two
      // 552px columns and 150px rows. Shared seams must occupy one pixel.
      const isBorderAt = (x: number, y: number) => {
        const offset = (y * info.width + x) * info.channels;
        return (data[offset]! + data[offset + 1]! + data[offset + 2]!) / 3 < 235;
      };
      expect([597, 598, 599, 600, 601, 602].filter((x) => isBorderAt(x, 200))).toHaveLength(1);
      expect([319, 320, 321, 322, 323, 324].filter((y) => isBorderAt(100, y))).toHaveLength(1);
    },
  );
});
