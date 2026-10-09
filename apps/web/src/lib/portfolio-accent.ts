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
    '--profile-accent': hex,
    '--profile-accent-foreground': `color-mix(in srgb, ${hex} 45%, var(--foreground))`,
    '--profile-heading-punctuation': 'var(--profile-accent-foreground)',
    '--profile-note-avatar-background': `color-mix(in srgb, ${hex} 15%, var(--background))`,
    '--profile-note-avatar-foreground': 'var(--profile-accent-foreground)',
    '--primary': hex,
    '--primary-soft': `color-mix(in srgb, ${hex} 35%, var(--portfolio-accent-on-dark))`,
    '--primary-soft-foreground': 'var(--portfolio-accent-on-light)',
    '--surface-inverse': `color-mix(in srgb, ${hex} 30%, var(--portfolio-accent-on-light))`,
    '--surface-inverse-foreground': 'var(--portfolio-accent-on-dark)',
    '--surface-subtle': `color-mix(in srgb, ${hex} 12%, var(--background))`,
    '--secondary': `color-mix(in srgb, ${hex} 12%, var(--background))`,
    '--secondary-foreground': 'var(--foreground)',
    '--accent': `color-mix(in srgb, ${hex} 12%, var(--background))`,
    '--accent-foreground': 'var(--foreground)',
    '--button-neutral-hover': `color-mix(in srgb, ${hex} 12%, var(--background))`,
    '--profile-grid-color': `color-mix(in srgb, ${hex} 7%, transparent)`,
    '--profile-orbit-foreground': `color-mix(in srgb, ${hex} 65%, var(--foreground))`,
    '--profile-seal-projects': 'var(--profile-accent-foreground)',
    '--profile-card-shadow': `0 1px 0 color-mix(in srgb, var(--foreground) 6%, transparent), 0 40px 80px -36px color-mix(in srgb, ${hex} 40%, transparent)`,
    '--location-card-shadow': `0 30px 60px -44px color-mix(in srgb, ${hex} 40%, transparent)`,
    '--location-control-shadow': `0 1px 2px color-mix(in srgb, ${hex} 20%, transparent), 0 4px 12px -4px color-mix(in srgb, ${hex} 25%, transparent)`,
    '--profile-card-sheen': `linear-gradient(115deg, transparent 20%, color-mix(in srgb, ${hex} 40%, transparent) 50%, transparent 80%)`,
    // Display text sits on the page surface, unlike a filled button. Extreme
    // custom accents need the page foreground to remain readable in both themes.
    '--profile-heading-accent': luminance > 0.35 || luminance < 0.02 ? 'var(--foreground)' : hex,
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
