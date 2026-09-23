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
      <DialogContent className="flex max-h-[calc(100dvh-1rem)] w-full flex-col gap-0 overflow-hidden p-0 data-[state=closed]:animate-none data-[state=open]:animate-none sm:max-w-4xl">
        <DialogHeader className="shrink-0 border-b border-border px-5 py-4 pr-14 text-left sm:px-6">
          <DialogTitle>Crop logo</DialogTitle>
          <DialogDescription>
            Drag to position your logo, then zoom until the square preview looks right.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto md:grid md:grid-cols-[minmax(0,1fr)_17rem]">
          <div className="relative h-[min(58dvh,28rem)] min-h-72 overflow-hidden bg-muted md:h-[min(64dvh,36rem)]">
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

          <div className="space-y-5 border-t border-border bg-card p-5 md:border-l md:border-t-0 md:p-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="logo-zoom">Zoom</Label>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {Math.round(zoom * 100)}%
                </span>
              </div>
              <div className="flex items-center gap-3">
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
            </div>

            <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
              The saved logo will be square and optimized for portfolio cards and workspace menus.
            </div>

            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </div>
        </div>

        <DialogFooter className="shrink-0 border-t border-border bg-card px-5 py-4 sm:px-6">
          <Button type="button" variant="outline" onClick={onChooseAnother} disabled={isSaving}>
            Choose another
          </Button>
          <Button
            type="button"
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
