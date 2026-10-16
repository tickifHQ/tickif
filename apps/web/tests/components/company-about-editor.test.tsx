import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { portfolioCompanyAboutSchema } from '@repo/contracts';
import { CompanyAboutEditor } from '../../src/components/company-about-editor';

const { uploadPortfolioCover } = vi.hoisted(() => ({ uploadPortfolioCover: vi.fn() }));
vi.mock('@/lib/portfolio-api', () => ({ uploadPortfolioCover }));

beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function renderEditor() {
  const onPhotoUploaded = vi.fn();
  render(
    <CompanyAboutEditor
      value={portfolioCompanyAboutSchema.parse({ story: 'Our company story.' })}
      onChange={vi.fn()}
      onPhotoUploaded={onPhotoUploaded}
    />,
  );
  return onPhotoUploaded;
}

describe('company photo editor', () => {
  it.each(['founder', 'studio'] as const)(
    'resizes and re-encodes a %s photo before saving it to its own target',
    async (target) => {
      const close = vi.fn();
      vi.stubGlobal(
        'createImageBitmap',
        vi.fn().mockResolvedValue({ width: 3200, height: 1600, close }),
      );
      const drawImage = vi.fn();
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
        drawImage,
      } as unknown as CanvasRenderingContext2D);
      const toBlob = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
        this: HTMLCanvasElement,
        callback,
      ) {
        expect([this.width, this.height]).toEqual([1600, 800]);
        callback(new Blob(['encoded photo'], { type: 'image/webp' }));
      });
      uploadPortfolioCover.mockResolvedValue({ heroCoverUrl: `https://cdn.test/${target}.webp` });
      const onPhotoUploaded = renderEditor();
      fireEvent.change(screen.getByLabelText(new RegExp(`^${target} photo`, 'i')), {
        target: { files: [new File(['original'], 'photo.jpg', { type: 'image/jpeg' })] },
      });
      await waitFor(() =>
        expect(onPhotoUploaded).toHaveBeenCalledWith(target, `https://cdn.test/${target}.webp`),
      );
      expect(uploadPortfolioCover).toHaveBeenCalledWith(expect.any(File), target);
      expect(uploadPortfolioCover.mock.calls[0]?.[0].type).toBe('image/webp');
      expect(toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/webp', 0.9);
      expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1600, 800);
      expect(close).toHaveBeenCalledOnce();
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    },
  );

  it('rejects unsupported files before decoding or uploading them', () => {
    const decode = vi.fn();
    vi.stubGlobal('createImageBitmap', decode);
    const onPhotoUploaded = renderEditor();
    fireEvent.change(screen.getByLabelText('Founder photo (optional)'), {
      target: { files: [new File(['svg'], 'photo.svg', { type: 'image/svg+xml' })] },
    });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Choose a JPEG, PNG, WebP or AVIF image under 10 MB.',
    );
    expect(decode).not.toHaveBeenCalled();
    expect(uploadPortfolioCover).not.toHaveBeenCalled();
    expect(onPhotoUploaded).not.toHaveBeenCalled();
  });

  it('keeps both upload controls available after a corrupt image fails to decode', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('Invalid image')));
    const onPhotoUploaded = renderEditor();
    fireEvent.change(screen.getByLabelText('Studio photo (optional)'), {
      target: { files: [new File(['invalid'], 'photo.jpg', { type: 'image/jpeg' })] },
    });
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Invalid image'));
    expect(screen.getByLabelText('Studio photo (optional)')).toBeEnabled();
    expect(screen.getByLabelText('Founder photo (optional)')).toBeEnabled();
    expect(uploadPortfolioCover).not.toHaveBeenCalled();
    expect(onPhotoUploaded).not.toHaveBeenCalled();
  });
});
