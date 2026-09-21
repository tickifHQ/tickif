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

/** One restrained mark for public preview derivatives. */
export function buildWatermarkSvg(
  imageWidth: number,
  imageHeight: number,
  cfg: WatermarkConfig,
): Buffer {
  const text = escapeXml(cfg.text);
  const markWidth = Math.max(36, Math.round(imageWidth * cfg.scale));
  const fontSize = Math.max(11, Math.round(markWidth / Math.max(cfg.text.length * 0.7, 1)));
  const margin = Math.max(10, Math.round(Math.min(imageWidth, imageHeight) * 0.025));
  const strokeOpacity = Number(cfg.opacity.toFixed(3));
  const strokeWidth = Math.max(0.75, fontSize * 0.035).toFixed(2);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${imageWidth}" height="${imageHeight}" viewBox="0 0 ${imageWidth} ${imageHeight}">
  <text x="${Math.round(imageWidth / 2)}" y="${imageHeight - margin}" text-anchor="middle"
    font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="500"
    fill="#ffffff" fill-opacity="${cfg.opacity}"
    stroke="#000000" stroke-opacity="${strokeOpacity}" stroke-width="${strokeWidth}" paint-order="stroke">${text}</text>
</svg>`;
  return Buffer.from(svg);
}
