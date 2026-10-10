import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { portfolioAccentStyle, validPortfolioAccent } from '../../src/lib/portfolio-accent';

describe('portfolio accent styles', () => {
  it('themes the full portfolio palette from its chosen colour', () => {
    const styles = portfolioAccentStyle('#4A90D9');
    expect(styles).toMatchObject({ '--profile-accent': '#4A90D9' });
    for (const token of [
      '--surface-inverse',
      '--surface-subtle',
      '--primary-soft',
      '--profile-grid-color',
      '--profile-orbit-foreground',
    ]) {
      expect(styles[token as keyof typeof styles]).toContain('#4A90D9');
    }
  });
  it.each([
    ['#123456', '--portfolio-accent-on-light'],
    ['#F2D355', '--portfolio-accent-on-dark'],
  ])('keeps hover and focus scoped to the chosen accent %s', (value, hoverTarget) => {
    expect(portfolioAccentStyle(value)).toMatchObject({
      '--ring': `color-mix(in srgb, ${value} 50%, var(--foreground))`,
      '--primary-hover': `color-mix(in oklab, ${value} 92%, var(${hoverTarget}))`,
    });
  });

  it('keeps every neutral colour above 4.5:1 using the actual foreground token values', () => {
    const theme = readFileSync(resolve('../../packages/ui/src/styles/themes/tickif.css'), 'utf8');
    expect(theme).toMatch(/--portfolio-accent-on-light:\s*#000000;/);
    expect(theme).toMatch(/--portfolio-accent-on-dark:\s*#ffffff;/);
    for (let channel = 0; channel <= 255; channel++) {
      const hex = `#${channel.toString(16).padStart(2, '0').repeat(3)}`;
      const luminance = channel <= 10 ? channel / 3294.6 : ((channel / 255 + 0.055) / 1.055) ** 2.4;
      const foreground =
        portfolioAccentStyle(hex)[
          '--primary-foreground' as keyof ReturnType<typeof portfolioAccentStyle>
        ];
      const ratio =
        foreground === 'var(--portfolio-accent-on-light)'
          ? (luminance + 0.05) / 0.05
          : 1.05 / (luminance + 0.05);
      expect(ratio, `contrast for ${hex}`).toBeGreaterThanOrEqual(4.5);
    }
  });
  it.each(['url(https://example.test)', 'red', '#123', '#123456; color:red', ''])(
    'never applies invalid colour %s to CSS',
    (value) => {
      expect(validPortfolioAccent(value)).toBeNull();
      expect(portfolioAccentStyle(value)).toEqual({});
    },
  );

  it('normalizes the existing six-digit contract', () => {
    expect(validPortfolioAccent('#abc123')).toBe('#ABC123');
  });

  it.each([
    ['#FFFFFF', 'var(--portfolio-accent-on-light)'],
    ['#000000', 'var(--portfolio-accent-on-dark)'],
    ['#808080', 'var(--portfolio-accent-on-light)'],
    ['#777777', 'var(--portfolio-accent-on-light)'],
  ])('selects a readable stable foreground for %s in either theme', (value, foreground) => {
    expect(portfolioAccentStyle(value)).toMatchObject({
      '--primary': value,
      '--primary-foreground': foreground,
    });
  });
});
