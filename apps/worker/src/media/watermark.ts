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
  const horizontalPadding = Math.max(7, Math.round(fontSize * 0.45));
  const verticalPadding = Math.max(4, Math.round(fontSize * 0.25));
  const badgeWidth = Math.max(
    markWidth,
    Math.round(cfg.text.length * fontSize * 0.58 + horizontalPadding * 2),
  );
  const badgeHeight = fontSize + verticalPadding * 2;
  const badgeX = Math.round((imageWidth - badgeWidth) / 2);
  const badgeY = imageHeight - margin - badgeHeight;
  const textY = Math.round(badgeY + verticalPadding + fontSize * 0.8);
  const badgeOpacity = Number(Math.min(0.6, cfg.opacity * 0.75).toFixed(3));

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${imageWidth}" height="${imageHeight}" viewBox="0 0 ${imageWidth} ${imageHeight}">
  <rect x="${badgeX}" y="${badgeY}" width="${badgeWidth}" height="${badgeHeight}" rx="${Math.round(badgeHeight / 2)}"
    fill="#000000" fill-opacity="${badgeOpacity}" />
  <text x="${Math.round(imageWidth / 2)}" y="${textY}" text-anchor="middle"
    font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="500"
    fill="#ffffff" fill-opacity="${cfg.opacity}">${text}</text>
</svg>`;
  return Buffer.from(svg);
}
