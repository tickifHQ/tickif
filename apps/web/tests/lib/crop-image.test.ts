import { afterEach, describe, expect, it, vi } from 'vitest';
import { cropImageToFile, cropPortfolioCoverToFile } from '../../src/lib/crop-image';

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

  it('renders a selected widescreen cover at its original resolution without stretching', async () => {
    const drawImage = vi.fn();
    const context = { drawImage, imageSmoothingEnabled: false, imageSmoothingQuality: 'low' };
    vi.stubGlobal('Image', TestImage);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      context as unknown as CanvasRenderingContext2D,
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => {
      callback(new Blob(['cover'], { type: 'image/webp' }));
    });
    const file = await cropPortfolioCoverToFile('blob:cover', {
      x: 100,
      y: 50,
      width: 800,
      height: 450,
    });
    expect(file).toEqual(
      expect.objectContaining({ name: 'portfolio-cover.webp', type: 'image/webp' }),
    );
    expect(drawImage).toHaveBeenCalledWith(
      expect.any(TestImage),
      100,
      50,
      800,
      450,
      0,
      0,
      800,
      450,
    );
  });

  it('bounds large cover output to 1920px wide while preserving 16:9 proportions', async () => {
    class LargeImage extends TestImage {
      override naturalWidth = 4000;
      override naturalHeight = 3000;
    }
    const drawImage = vi.fn();
    vi.stubGlobal('Image', LargeImage);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage,
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) =>
      callback(new Blob(['cover'])),
    );
    await cropPortfolioCoverToFile('blob:large', { x: 0, y: 0, width: 3200, height: 1800 });
    expect(drawImage).toHaveBeenCalledWith(
      expect.any(LargeImage),
      0,
      0,
      3200,
      1800,
      0,
      0,
      1920,
      1080,
    );
  });

  it('rejects a square cover crop rather than stretching it to widescreen', async () => {
    await expect(
      cropPortfolioCoverToFile('blob:cover', { x: 0, y: 0, width: 800, height: 800 }),
    ).rejects.toThrow('Choose a widescreen cover crop');
  });
});
