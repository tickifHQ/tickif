'use client';

import { useCallback, useEffect, useState } from 'react';
import Cropper, { type Area, type Point } from 'react-easy-crop';
import { ImageIcon, Loader2, ZoomIn } from 'lucide-react';
import { Button } from '@repo/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@repo/ui/components/dialog';
import { Label } from '@repo/ui/components/label';
import { Slider } from '@repo/ui/components/slider';

export function PortfolioCoverCropDialog({
  open,
  imageSource,
  isSaving,
  error,
  onOpenChange,
  onChooseAnother,
  onSave,
}: {
  open: boolean;
  imageSource: string | null;
  isSaving: boolean;
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onChooseAnother: () => void;
  onSave: (pixels: Area) => void;
}) {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedArea, setCroppedArea] = useState<Area | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedArea(null);
    setMediaError(null);
  }, [imageSource, open]);

  const handleCropComplete = useCallback((_area: Area, pixels: Area) => {
    setCroppedArea(pixels);
  }, []);

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !isSaving && onOpenChange(nextOpen)}>
      <DialogContent className="flex max-h-[calc(100dvh-1rem)] w-full flex-col gap-0 overflow-hidden p-0 data-[state=closed]:animate-none data-[state=open]:animate-none sm:max-w-md">
        <DialogHeader className="shrink-0 border-b border-border px-5 py-3.5 pr-14 text-left">
          <DialogTitle>Adjust portfolio cover</DialogTitle>
          <DialogDescription>
            Drag to reposition your image and zoom to frame the cover. The highlighted 16:9 area is
            what will be saved.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div
            data-testid="cover-crop-surface"
            className="relative h-[min(42dvh,22rem)] min-h-56 overflow-hidden bg-muted"
          >
            {imageSource ? (
              <Cropper
                image={imageSource}
                crop={crop}
                zoom={zoom}
                minZoom={1}
                maxZoom={3}
                aspect={16 / 9}
                cropShape="rect"
                showGrid
                objectFit="contain"
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={handleCropComplete}
                mediaProps={{
                  alt: 'Portfolio cover being adjusted',
                  onError: () => setMediaError('Could not read this image. Choose another file.'),
                }}
                classes={{ cropAreaClassName: 'border-2 border-background' }}
              />
            ) : (
              <div className="flex size-full items-center justify-center text-muted-foreground">
                <ImageIcon className="size-8" aria-hidden />
              </div>
            )}
          </div>

          <div className="space-y-3 border-t border-border bg-card px-5 py-3.5">
            <div
              data-testid="cover-zoom-row"
              className="mx-auto flex w-full max-w-xs items-center gap-3"
            >
              <Label htmlFor="cover-zoom" className="shrink-0">
                Zoom
              </Label>
              <div
                data-testid="cover-zoom-control"
                className="flex min-w-0 flex-1 items-center gap-2"
              >
                <ZoomIn className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <Slider
                  id="cover-zoom"
                  aria-label="Cover zoom"
                  min={1}
                  max={3}
                  step={0.01}
                  value={[zoom]}
                  disabled={isSaving}
                  onValueChange={(value) => setZoom(value[0] ?? 1)}
                />
              </div>
              <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                {Math.round(zoom * 100)}%
              </span>
            </div>

            {mediaError || error ? (
              <p role="alert" className="text-sm text-destructive">
                {mediaError || error}
              </p>
            ) : null}
          </div>
        </div>

        <DialogFooter className="shrink-0 border-t border-border bg-card px-5 py-3.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onChooseAnother}
            disabled={isSaving}
          >
            Choose another
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => croppedArea && onSave(croppedArea)}
            disabled={!croppedArea || isSaving || Boolean(mediaError)}
          >
            {isSaving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            Save cover
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
