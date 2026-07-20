import { config } from '@repo/config';

export type WatermarkConfig = {
  text: string;
  opacity: number;
  /** Single mark width as a fraction of the image width. */
  scale: number;
  rotation: number;
};

export const defaultWatermarkConfig: WatermarkConfig | null = config.WATERMARK_ENABLED
  ? {
      text: config.WATERMARK_TEXT,
      opacity: config.WATERMARK_OPACITY,
      scale: config.WATERMARK_SCALE,
      rotation: config.WATERMARK_ROTATION,
    }
  : null;

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) =>
    c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '&' ? '&amp;' : c === "'" ? '&apos;' : '&quot;',
  );
}

/** A restrained, staggered full-canvas watermark pattern for public preview derivatives. */
export function buildWatermarkSvg(
  imageWidth: number,
  imageHeight: number,
  cfg: WatermarkConfig,
): Buffer {
  const text = escapeXml(cfg.text);
  const markWidth = Math.max(36, Math.round(imageWidth * cfg.scale));
  const fontSize = Math.max(11, Math.round(markWidth / Math.max(cfg.text.length * 0.62, 1)));
  const tileWidth = Math.round(markWidth * 2.6);
  const rowHeight = Math.round(fontSize * 4.8);
  const strokeOpacity = Number((cfg.opacity * 0.25).toFixed(3));
  const strokeWidth = Math.max(0.35, fontSize * 0.012).toFixed(2);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${imageWidth}" height="${imageHeight}" viewBox="0 0 ${imageWidth} ${imageHeight}">
  <defs>
    <pattern id="tickif-watermark" width="${tileWidth}" height="${rowHeight * 2}" patternUnits="userSpaceOnUse" patternTransform="rotate(${cfg.rotation})">
      <g font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="600"
        fill="#ffffff" fill-opacity="${cfg.opacity}"
        stroke="#000000" stroke-opacity="${strokeOpacity}" stroke-width="${strokeWidth}" paint-order="stroke">
        <text x="${Math.round(tileWidth / 2)}" y="${Math.round(rowHeight / 2)}" text-anchor="middle" dominant-baseline="middle">${text}</text>
        <!-- Pattern content clips at tile edges (neighbors do NOT complete it), so the
             seam-spanning staggered mark is drawn at both x=0 and x=tileWidth: adjacent
             tiles each contribute their half and compose the full word across the seam. -->
        <text x="0" y="${Math.round(rowHeight * 1.5)}" text-anchor="middle" dominant-baseline="middle">${text}</text>
        <text x="${tileWidth}" y="${Math.round(rowHeight * 1.5)}" text-anchor="middle" dominant-baseline="middle">${text}</text>
      </g>
    </pattern>
  </defs>
  <rect width="100%" height="100%" fill="url(#tickif-watermark)" />
</svg>`;
  return Buffer.from(svg);
}
