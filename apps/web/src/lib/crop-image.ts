import type { Area } from 'react-easy-crop';

const LOGO_OUTPUT_SIZE = 512;
const LOGO_OUTPUT_TYPE = 'image/webp';
const LOGO_OUTPUT_QUALITY = 0.9;

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not read this image. Choose another file.'));
    image.src = source;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Could not prepare the cropped logo. Please try again.'));
      },
      LOGO_OUTPUT_TYPE,
      LOGO_OUTPUT_QUALITY,
    );
  });
}

/** Render a validated square crop to a compact, upload-ready WebP file. */
export async function cropImageToFile(
  imageSource: string,
  crop: Area,
  fileName = 'studio-logo.webp',
): Promise<File> {
  if (
    ![crop.x, crop.y, crop.width, crop.height].every(Number.isFinite) ||
    crop.width <= 0 ||
    crop.height <= 0
  ) {
    throw new Error('Choose a valid crop before saving.');
  }

  const image = await loadImage(imageSource);
  const sourceX = Math.max(0, Math.min(crop.x, image.naturalWidth - 1));
  const sourceY = Math.max(0, Math.min(crop.y, image.naturalHeight - 1));
  const sourceWidth = Math.min(crop.width, image.naturalWidth - sourceX);
  const sourceHeight = Math.min(crop.height, image.naturalHeight - sourceY);

  if (sourceWidth <= 0 || sourceHeight <= 0) {
    throw new Error('Choose a valid crop before saving.');
  }

  const canvas = document.createElement('canvas');
  canvas.width = LOGO_OUTPUT_SIZE;
  canvas.height = LOGO_OUTPUT_SIZE;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Image editing is not supported in this browser.');

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    LOGO_OUTPUT_SIZE,
    LOGO_OUTPUT_SIZE,
  );

  const blob = await canvasToBlob(canvas);
  return new File([blob], fileName.replace(/\.[^.]+$/, '.webp'), {
    type: LOGO_OUTPUT_TYPE,
    lastModified: Date.now(),
  });
}
