import { config } from '@repo/config';

export type WatermarkConfig = {
  text: string;
  opacity: number;
  /** Single mark width as a fraction of the image width. */
  scale: number;
};

export const defaultWatermarkConfig: WatermarkConfig | null = config.WATERMARK_ENABLED
  ? {
      text: config.WATERMARK_TEXT,
      opacity: config.WATERMARK_OPACITY,
      scale: config.WATERMARK_SCALE,
    }
  : null;

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) =>
    c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '&' ? '&amp;' : c === "'" ? '&apos;' : '&quot;',
  );
}

/** The image-page design uses the same white wordmark at center and bottom right. */
export function buildWatermarkSvg(
  imageWidth: number,
  imageHeight: number,
  cfg: WatermarkConfig,
): Buffer {
  const text = escapeXml(cfg.text);
  // JetBrains Mono glyphs are 0.6em wide, with the design's 0.06em tracking.
  const textWidthEm = cfg.text.length * 0.6 + Math.max(0, cfg.text.length - 1) * 0.06;
  const fontSize = Math.min(
    Math.max(8, Math.round((imageWidth * cfg.scale) / textWidthEm)),
    imageWidth / (textWidthEm + 2),
    imageHeight / 4,
  );
  const margin = Math.max(fontSize + 1, Math.min(imageWidth, imageHeight) * (32 / 760));
  const baselineOffset = fontSize * 0.35;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${imageWidth}" height="${imageHeight}" viewBox="0 0 ${imageWidth} ${imageHeight}">
  <g font-family="JetBrains Mono, monospace" font-size="${fontSize}" font-weight="500"
    letter-spacing="${fontSize * 0.06}" fill="#ffffff" fill-opacity="${cfg.opacity}">
    <text x="${imageWidth / 2}" y="${imageHeight / 2 + baselineOffset}" text-anchor="middle">${text}</text>
    <text x="${imageWidth - margin}" y="${imageHeight - margin + baselineOffset}" text-anchor="end">${text}</text>
  </g>
</svg>`;
  return Buffer.from(svg);
}
