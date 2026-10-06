import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PortfolioCoverCropDialog } from '../../src/components/portfolio-cover-crop-dialog';

vi.mock('react-easy-crop', () => ({
  default: ({
    aspect,
    cropShape,
    initialCroppedAreaPercentages,
    onCropComplete,
    crop,
    zoom,
    onCropChange,
    onZoomChange,
  }: {
    aspect: number;
    crop: { x: number; y: number };
    zoom: number;
    onCropChange: (crop: { x: number; y: number }) => void;
    onZoomChange: (zoom: number) => void;
    cropShape: string;
    initialCroppedAreaPercentages?: { x: number; y: number; width: number; height: number };
    onCropComplete: (
      percentage: { x: number; y: number; width: number; height: number },
      pixels: { x: number; y: number; width: number; height: number },
    ) => void;
  }) => (
    <button
      type="button"
      data-testid="cropper"
      data-aspect={aspect}
      data-crop-shape={cropShape}
      data-initial-crop={JSON.stringify(initialCroppedAreaPercentages ?? null)}
      data-crop={JSON.stringify(crop)}
      data-zoom={zoom}
      onClick={() => {
        onCropChange({ x: 80, y: 20 });
        onZoomChange(2);
        onCropComplete(
          { x: 10, y: 10, width: 80, height: 45 },
          { x: 20, y: 20, width: 800, height: 450 },
        );
      }}
    >
      Prepare crop
    </button>
  ),
}));

describe('PortfolioCoverCropDialog', () => {
  it('previews a widescreen cover and requires a prepared crop before saving', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(
      <PortfolioCoverCropDialog
        open
        imageSource="blob:cover"

        isSaving={false}
        error={null}
        onOpenChange={vi.fn()}
        onChooseAnother={vi.fn()}
        onSave={onSave}
      />,
    );

    expect(screen.getByRole('dialog', { name: 'Adjust portfolio cover' })).toHaveClass(
      'sm:max-w-md',
    );
    expect(screen.getByTestId('cover-crop-surface')).toHaveClass(
      'h-[min(42dvh,22rem)]',
      'min-h-56',
    );
    expect(screen.getByTestId('cropper')).toHaveAttribute('data-aspect', String(16 / 9));
    expect(screen.getByTestId('cropper')).toHaveAttribute('data-crop-shape', 'rect');
    expect(screen.getByText(/highlighted 16:9 area/i)).toBeInTheDocument();
    const zoom = screen.getByRole('slider', { name: 'Cover zoom' });
    const chooseAnother = screen.getByRole('button', { name: 'Choose another' });
    const saveCover = screen.getByRole('button', { name: 'Save cover' });

    expect(zoom).toBeInTheDocument();
    expect(screen.getByTestId('cover-zoom-row')).toHaveClass('mx-auto', 'max-w-xs', 'items-center');
    expect(screen.getByTestId('cover-zoom-control')).toHaveClass('flex-1');
    expect(zoom.compareDocumentPosition(chooseAnother)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(chooseAnother.compareDocumentPosition(saveCover)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(chooseAnother).toHaveClass('h-9');
    expect(saveCover).toHaveClass('h-9');
    expect(screen.queryByText(/saved logo will be square and optimized/i)).not.toBeInTheDocument();
    expect(saveCover).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Prepare crop' }));
    await user.click(screen.getByRole('button', { name: 'Save cover' }));

    expect(onSave).toHaveBeenCalledWith({ x: 20, y: 20, width: 800, height: 450 });
  });

  it('keeps replacement and upload errors inside the editing flow', async () => {
    const onChooseAnother = vi.fn();
    const user = userEvent.setup();
    render(
      <PortfolioCoverCropDialog
        open
        imageSource="blob:cover"

        isSaving={false}
        error="Could not upload cover."
        onOpenChange={vi.fn()}
        onChooseAnother={onChooseAnother}
        onSave={vi.fn()}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Could not upload cover.');
    await user.click(screen.getByRole('button', { name: 'Choose another' }));
    expect(onChooseAnother).toHaveBeenCalledOnce();
  });

  it('allows cancellation and blocks changing or resubmitting while saving', async () => {
    const onOpenChange = vi.fn();
    const props = {
      open: true,
      imageSource: 'blob:cover',
      error: null,
      onOpenChange,
      onChooseAnother: vi.fn(),
      onSave: vi.fn(),
    };
    const { rerender } = render(<PortfolioCoverCropDialog {...props} isSaving={false} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    rerender(<PortfolioCoverCropDialog {...props} isSaving />);
    const cropper = screen.getByTestId('cropper');
    fireEvent.click(cropper);
    expect(cropper).toHaveAttribute('data-crop', JSON.stringify({ x: 0, y: 0 }));
    expect(cropper).toHaveAttribute('data-zoom', '1');
    expect(screen.getByTestId('cover-crop-surface')).toHaveAttribute('inert');
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Choose another' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save cover' })).toBeDisabled();
    expect(screen.getByRole('slider', { name: 'Cover zoom' })).toHaveAttribute('data-disabled');
  });
});
