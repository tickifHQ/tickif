import { config } from '@repo/config';

export type WatermarkConfig = {
  text: string;
  opacity: number;
  /** Watermark width as a fraction of the image width. */
  scale: number;
  gravity: string;
  /** Images narrower than this skip the watermark — it would be illegible. */
  minImageWidth: number;
};

export const defaultWatermarkConfig: WatermarkConfig | null = config.WATERMARK_ENABLED
  ? {
      text: config.WATERMARK_TEXT,
      opacity: config.WATERMARK_OPACITY,
      scale: 0.3,
      gravity: 'southeast',
      minImageWidth: 200,
    }
  : null;

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) =>
    c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '&' ? '&amp;' : c === "'" ? '&apos;' : '&quot;',
  );
}

/** A standalone SVG badge sized for `imageWidth`, composited via gravity (not full-canvas). */
export function buildWatermarkSvg(imageWidth: number, cfg: WatermarkConfig): Buffer {
  const text = escapeXml(cfg.text);
  const badgeWidth = Math.round(imageWidth * cfg.scale);
  const fontSize = Math.max(10, Math.round(badgeWidth / Math.max(text.length, 1)) + 4);
  const padding = Math.round(fontSize * 0.5);
  const height = fontSize + padding * 2;
  const width = badgeWidth + padding * 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <text x="${width - padding}" y="${height - padding}" text-anchor="end"
    font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="700"
    fill="#ffffff" fill-opacity="${cfg.opacity}"
    stroke="#000000" stroke-opacity="${cfg.opacity * 0.5}" stroke-width="1" paint-order="stroke">${text}</text>
</svg>`;
  return Buffer.from(svg);
}
