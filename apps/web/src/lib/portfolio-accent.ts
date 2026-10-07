import type { CSSProperties } from 'react';
import { updatePortfolioSchema } from '@repo/contracts';

/** Share the API's hex validation before allowing user input into CSS. */
export function validPortfolioAccent(value: string): string | null {
  const parsed = updatePortfolioSchema.shape.accentColor.safeParse(value);
  return parsed.success && parsed.data ? parsed.data.toUpperCase() : null;
}

/** Choose the higher-contrast foreground, independent of light/dark theme. */
export function portfolioAccentStyle(value: string): CSSProperties {
  const hex = validPortfolioAccent(value);
  if (!hex) return {};
  const channels = [1, 3, 5].map((offset) => {
    const channel = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
  // Black/white contrast crosses at sqrt(0.05 * 1.05) - 0.05.
  const darkForeground = luminance > Math.sqrt(0.05 * 1.05) - 0.05;
  return {
    '--primary': hex,
    '--primary-foreground': darkForeground
      ? 'var(--portfolio-accent-on-light)'
      : 'var(--portfolio-accent-on-dark)',
    // Override all accent-dependent roles together; inherited theme variables
    // otherwise retain the brand's green hover and ring in a custom portfolio.
    '--primary-hover': `color-mix(in oklab, ${hex} 92%, var(${darkForeground ? '--portfolio-accent-on-dark' : '--portfolio-accent-on-light'}))`,
    '--button-primary-shadow': `0 14px 30px -14px color-mix(in oklab, ${hex} 70%, transparent)`,
    '--ring': `color-mix(in srgb, ${hex} 50%, var(--foreground))`,
  } as CSSProperties;
}
