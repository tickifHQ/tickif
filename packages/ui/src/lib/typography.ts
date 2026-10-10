/** Measured text styles from Figma home frame 16095:51371.
 * Font families stay semantic; percent tracking is converted to em, not pixels.
 */
export const typography = {
  homeHero:
    'font-display font-medium text-[clamp(2.5rem,5.82vw,5.5rem)] leading-[1.09090909] tracking-[-0.045454545em] xl:text-[88px] xl:leading-[96px] xl:tracking-[-4px]',
  headingH1: 'font-display font-medium text-[44px] leading-[48px] tracking-[-0.025em]',
  headingH2: 'font-display font-medium text-[32px] leading-[38px] tracking-[-0.02em]',
  headingH3: 'font-display font-medium text-2xl leading-[30px] tracking-[-0.015em]',
  headingH4: 'font-display font-medium text-lg leading-6 tracking-[-0.01em]',
  designerHero:
    'font-display font-medium text-4xl leading-[1.03125] tracking-[-0.03em] sm:text-5xl xl:text-[64px] xl:leading-[66px]',
  price:
    'font-display font-medium text-[clamp(2.75rem,4.23vw,4rem)] leading-[1.03125] tracking-[-0.03em]',
  bodyLg: 'font-sans font-normal text-lg leading-7 tracking-[-0.004em]',
  bodyMd: 'font-sans font-normal text-base leading-[25px] tracking-[-0.002em]',
  bodySm: 'font-sans font-normal text-sm leading-[21px] tracking-[-0.001em]',
  bodyXs: 'font-sans font-normal text-[13px] leading-[19px] tracking-normal',
  body2xs: 'font-sans font-normal text-xs leading-4 tracking-normal',
  labelLg: 'font-sans font-medium text-base leading-5 tracking-[-0.003em]',
  labelMd: 'font-sans font-medium text-sm leading-[18px] tracking-[-0.002em]',
  labelSm: 'font-sans font-medium text-[13px] leading-4 tracking-[-0.001em]',
  monoXs: 'font-mono font-medium text-[10px] leading-3 tracking-[0.06em]',
  monoSm: 'font-mono font-medium text-[11px] leading-[14px] tracking-[0.06em]',
  monoMd: 'font-mono font-medium text-xs leading-4 tracking-[0.04em]',
} as const;
