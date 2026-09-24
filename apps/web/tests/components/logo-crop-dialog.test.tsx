import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LogoCropDialog } from '../../src/components/logo-crop-dialog';

vi.mock('react-easy-crop', () => ({
  default: ({
    aspect,
    cropShape,
    initialCroppedAreaPercentages,
    onCropComplete,
  }: {
    aspect: number;
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
      onClick={() =>
        onCropComplete(
          { x: 10, y: 10, width: 80, height: 80 },
          { x: 20, y: 20, width: 400, height: 400 },
        )
      }
    >
      Prepare crop
    </button>
  ),
}));

describe('LogoCropDialog', () => {
  it('uses one square crop workflow and returns the selected pixels', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(
      <LogoCropDialog
        open
        imageSource="blob:logo"
        initialCrop={null}
        isSaving={false}
        error={null}
        onOpenChange={vi.fn()}
        onChooseAnother={vi.fn()}
        onSave={onSave}
      />,
    );

    expect(screen.getByRole('dialog', { name: 'Crop logo' })).toBeInTheDocument();
    expect(screen.getByTestId('cropper')).toHaveAttribute('data-aspect', '1');
    expect(screen.getByTestId('cropper')).toHaveAttribute('data-crop-shape', 'rect');
    const zoom = screen.getByRole('slider', { name: 'Logo zoom' });
    const chooseAnother = screen.getByRole('button', { name: 'Choose another' });
    const saveLogo = screen.getByRole('button', { name: 'Save logo' });

    expect(zoom).toBeInTheDocument();
    expect(zoom.compareDocumentPosition(chooseAnother)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(chooseAnother.compareDocumentPosition(saveLogo)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(screen.queryByText(/saved logo will be square and optimized/i)).not.toBeInTheDocument();
    expect(saveLogo).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Prepare crop' }));
    await user.click(screen.getByRole('button', { name: 'Save logo' }));

    expect(onSave).toHaveBeenCalledWith({
      pixels: { x: 20, y: 20, width: 400, height: 400 },
      percentages: { x: 10, y: 10, width: 80, height: 80 },
    });
  });

  it('restores the saved crop percentages when editing an existing logo', () => {
    const initialCrop = { x: 14, y: 8, width: 42, height: 64 };
    render(
      <LogoCropDialog
        open
        imageSource="https://storage.example.com/source.png"
        initialCrop={initialCrop}
        isSaving={false}
        error={null}
        onOpenChange={vi.fn()}
        onChooseAnother={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    expect(screen.getByTestId('cropper')).toHaveAttribute(
      'data-initial-crop',
      JSON.stringify(initialCrop),
    );
  });

  it('keeps replacement and upload errors inside the editing flow', async () => {
    const onChooseAnother = vi.fn();
    const user = userEvent.setup();
    render(
      <LogoCropDialog
        open
        imageSource="blob:logo"
        initialCrop={null}
        isSaving={false}
        error="Could not upload logo."
        onOpenChange={vi.fn()}
        onChooseAnother={onChooseAnother}
        onSave={vi.fn()}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Could not upload logo.');
    await user.click(screen.getByRole('button', { name: 'Choose another' }));
    expect(onChooseAnother).toHaveBeenCalledOnce();
  });
});
