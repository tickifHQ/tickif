import { afterEach, describe, expect, it, vi } from 'vitest';
import { cropImageToFile } from '../../src/lib/crop-image';

class TestImage {
  crossOrigin = '';
  naturalWidth = 1200;
  naturalHeight = 800;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;

  set src(_value: string) {
    queueMicrotask(() => this.onload?.());
  }
}

describe('cropImageToFile', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders the chosen crop to a 512px square WebP', async () => {
    const drawImage = vi.fn();
    const context = {
      drawImage,
      imageSmoothingEnabled: false,
      imageSmoothingQuality: 'low',
    };
    vi.stubGlobal('Image', TestImage);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      context as unknown as CanvasRenderingContext2D,
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => {
      callback(new Blob(['webp'], { type: 'image/webp' }));
    });

    const result = await cropImageToFile(
      'blob:source-logo',
      { x: 100, y: 50, width: 600, height: 600 },
      'wide-logo.png',
    );

    expect(result).toEqual(expect.objectContaining({ name: 'wide-logo.webp', type: 'image/webp' }));
    expect(drawImage).toHaveBeenCalledWith(
      expect.any(TestImage),
      100,
      50,
      600,
      600,
      0,
      0,
      512,
      512,
    );
    expect(context.imageSmoothingEnabled).toBe(true);
    expect(context.imageSmoothingQuality).toBe('high');
  });

  it('rejects an empty or invalid crop before processing the image', async () => {
    await expect(
      cropImageToFile('blob:source-logo', { x: 0, y: 0, width: 0, height: 0 }),
    ).rejects.toThrow('Choose a valid crop before saving.');
  });
});
