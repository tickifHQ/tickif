import { config } from '@repo/config';

export type WatermarkConfig = {
  text: string;
  opacity: number;
  /** Single mark width as a fraction of the image width. */
  scale: number;
  /** Images narrower than this skip the watermark — it would be illegible. */
  minImageWidth: number;
};

export const defaultWatermarkConfig: WatermarkConfig | null = config.WATERMARK_ENABLED
  ? {
      text: config.WATERMARK_TEXT,
      opacity: config.WATERMARK_OPACITY,
      scale: 0.22,
      minImageWidth: 200,
    }
  : null;

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) =>
    c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '&' ? '&amp;' : c === "'" ? '&apos;' : '&quot;',
  );
}

/** A full-canvas, evenly tiled watermark overlay for public preview derivatives. */
export function buildWatermarkSvg(imageWidth: number, imageHeight: number, cfg: WatermarkConfig): Buffer {
  const text = escapeXml(cfg.text);
  const markWidth = Math.max(96, Math.round(imageWidth * cfg.scale));
  const fontSize = Math.max(14, Math.round(markWidth / Math.max(cfg.text.length * 0.58, 1)));
  const horizontalGap = Math.max(markWidth * 1.45, fontSize * 6);
  const verticalGap = Math.max(fontSize * 4.4, 96);
  const rotation = -24;
  const rowCount = Math.ceil(imageHeight / verticalGap) + 3;
  const columnCount = Math.ceil(imageWidth / horizontalGap) + 3;
  const marks: string[] = [];

  for (let row = -1; row < rowCount; row += 1) {
    const y = Math.round(row * verticalGap + verticalGap / 2);
    const rowOffset = row % 2 === 0 ? 0 : horizontalGap / 2;

    for (let column = -1; column < columnCount; column += 1) {
      const x = Math.round(column * horizontalGap + rowOffset + horizontalGap / 2);
      marks.push(
        `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle">${text}</text>`,
      );
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${imageWidth}" height="${imageHeight}" viewBox="0 0 ${imageWidth} ${imageHeight}">
  <g transform="rotate(${rotation} ${imageWidth / 2} ${imageHeight / 2})"
    font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="700"
    fill="#ffffff" fill-opacity="${cfg.opacity}"
    stroke="#000000" stroke-opacity="${cfg.opacity * 0.45}" stroke-width="1" paint-order="stroke">
    ${marks.join('\n    ')}
  </g>
</svg>`;
  return Buffer.from(svg);
}
