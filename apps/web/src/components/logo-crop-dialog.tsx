'use client';

import { useCallback, useEffect, useState } from 'react';
import Cropper, { type Area, type Point } from 'react-easy-crop';
import { ImageIcon, Loader2, ZoomIn } from 'lucide-react';
import type { LogoCropArea } from '@repo/contracts';
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

export function LogoCropDialog({
  open,
  imageSource,
  initialCrop,
  isSaving,
  error,
  onOpenChange,
  onChooseAnother,
  onSave,
}: {
  open: boolean;
  imageSource: string | null;
  initialCrop: LogoCropArea | null;
  isSaving: boolean;
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onChooseAnother: () => void;
  onSave: (selection: { pixels: Area; percentages: LogoCropArea }) => void;
}) {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedArea, setCroppedArea] = useState<Area | null>(null);
  const [croppedAreaPercentages, setCroppedAreaPercentages] = useState<LogoCropArea | null>(null);

  useEffect(() => {
    if (!open) return;
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedArea(null);
    setCroppedAreaPercentages(null);
  }, [imageSource, open]);

  const handleCropComplete = useCallback((area: Area, pixels: Area) => {
    setCroppedArea(pixels);
    setCroppedAreaPercentages(area);
  }, []);

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !isSaving && onOpenChange(nextOpen)}>
      <DialogContent className="flex max-h-[calc(100dvh-1rem)] w-full flex-col gap-0 overflow-hidden p-0 data-[state=closed]:animate-none data-[state=open]:animate-none sm:max-w-md">
        <DialogHeader className="shrink-0 border-b border-border px-5 py-3.5 pr-14 text-left">
          <DialogTitle>Crop logo</DialogTitle>
          <DialogDescription>
            Drag to position your logo, then zoom until the square preview looks right.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div
            data-testid="logo-crop-surface"
            className="relative h-[min(42dvh,22rem)] min-h-56 overflow-hidden bg-muted"
          >
            {imageSource ? (
              <Cropper
                image={imageSource}
                crop={crop}
                zoom={zoom}
                minZoom={1}
                maxZoom={3}
                initialCroppedAreaPercentages={initialCrop ?? undefined}
                aspect={1}
                cropShape="rect"
                showGrid
                objectFit="contain"
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={handleCropComplete}
                mediaProps={{ alt: 'Logo being cropped' }}
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
              data-testid="logo-zoom-row"
              className="mx-auto flex w-full max-w-xs items-center gap-3"
            >
              <Label htmlFor="logo-zoom" className="shrink-0">
                Zoom
              </Label>
              <div
                data-testid="logo-zoom-control"
                className="flex min-w-0 flex-1 items-center gap-2"
              >
                <ZoomIn className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <Slider
                  id="logo-zoom"
                  aria-label="Logo zoom"
                  min={1}
                  max={3}
                  step={0.01}
                  value={[zoom]}
                  onValueChange={(value) => setZoom(value[0] ?? 1)}
                />
              </div>
              <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                {Math.round(zoom * 100)}%
              </span>
            </div>

            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </div>
        </div>

        <DialogFooter className="shrink-0 border-t border-border bg-card px-5 py-3.5">
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
            onClick={() =>
              croppedArea &&
              croppedAreaPercentages &&
              onSave({ pixels: croppedArea, percentages: croppedAreaPercentages })
            }
            disabled={!croppedArea || !croppedAreaPercentages || isSaving}
          >
            {isSaving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            Save logo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
