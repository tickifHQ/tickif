import { describe, expect, it } from 'vitest';
import { ImageResponse } from 'next/og';
import sharp from 'sharp';
import { PublicSocialCard } from '@/components/public-social-card';

describe('PublicSocialCard rendered text bounds', () => {
  it.each([true, false])(
    'keeps long unbroken text out of the right gutter (cover: %s)',
    async (withCover) => {
      const cover = await sharp({
        create: { width: 500, height: 630, channels: 4, background: '#eac4ad' },
      })
        .png()
        .toBuffer();
      const card = new ImageResponse(
        <PublicSocialCard
          title={'W'.repeat(160)}
          eyebrow={'W'.repeat(90)}
          studio={'W'.repeat(72)}
          description={'W'.repeat(170)}
          image={withCover ? `data:image/png;base64,${cover.toString('base64')}` : null}
        />,
        { width: 1200, height: 630 },
      );
      const png = Buffer.from(await card.arrayBuffer());
      const gutterPixels = await sharp(png)
        .extract({ left: withCover ? 660 : 1160, top: 0, width: 40, height: 630 })
        .removeAlpha()
        .png()
        .toBuffer();
      const gutter = await sharp(gutterPixels).stats();
      // Every text block must retain the card's right padding, including a name
      // or title with no whitespace; text must not run behind the cover image.
      expect(gutter.channels.map(({ min, max }) => [min, max])).toEqual([
        [7, 7],
        [19, 19],
        [15, 15],
      ]);
    },
  );
});
