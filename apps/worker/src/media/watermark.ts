import { readFileSync } from 'node:fs';
import { config } from '@repo/config';

export type WatermarkConfig = {
  /** Multiplier for the opacity already defined in the design assets. */
  opacity: number;
  /** Symbol width as a fraction of the image width. */
  scale: number;
};

export const defaultWatermarkConfig: WatermarkConfig | null = config.WATERMARK_ENABLED
  ? { opacity: config.WATERMARK_OPACITY, scale: config.WATERMARK_SCALE }
  : null;

function asset(name: string): string {
  return `data:image/svg+xml;base64,${readFileSync(new URL(`./assets/${name}.svg`, import.meta.url)).toString('base64')}`;
}

const headerSymbol = asset('header-symbol');
const headerWordmark = asset('header-wordmark');
const centerSymbol = asset('center-symbol');
const cornerSymbol = asset('corner-symbol');

/** Native asset geometry comes from the 278px-wide Figma watermark reference. */
export function buildWatermarkSvg(
  imageWidth: number,
  imageHeight: number,
  cfg: WatermarkConfig,
): Buffer {
  const unit = Math.min((imageWidth * cfg.scale) / 12, imageWidth / 80, imageHeight / 64);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
    width="${imageWidth}" height="${imageHeight}" viewBox="0 0 ${imageWidth} ${imageHeight}">
  <g opacity="${cfg.opacity}">
    <g transform="scale(${unit})">
      <image x="14.798" y="13.848" width="17.3176" height="17.4937" xlink:href="${headerSymbol}"/>
      <image x="28.863" y="15.348" width="31.0898" height="14.4937" opacity="0.5" xlink:href="${headerWordmark}"/>
    </g>
    <g transform="translate(${imageWidth / 2 - 10 * unit} ${imageHeight / 2 - 10.5 * unit}) scale(${unit})">
      <image width="20" height="21" xlink:href="${centerSymbol}"/>
    </g>
    <g transform="translate(${imageWidth - 28 * unit} ${imageHeight - 28.1254 * unit}) scale(${unit})">
      <image width="20" height="21" xlink:href="${cornerSymbol}"/>
    </g>
  </g>
</svg>`;
  return Buffer.from(svg);
}
