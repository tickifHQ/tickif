'use client';

import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type ChangeEvent,
  type DragEvent,
  type Ref,
} from 'react';
import Image from 'next/image';
import { ImagePlus, Loader2, Pencil, Upload, X } from 'lucide-react';
import type { LogoCropArea, UploadLogoResponse } from '@repo/contracts';
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
import { RequiredFieldIndicator } from '@repo/ui/components/required-field-indicator';
import { cn } from '@repo/ui/lib/utils';
import { LogoCropDialog } from '@/components/logo-crop-dialog';
import { cropImageToFile } from '@/lib/crop-image';
import { uploadLogo } from '@/lib/portfolio-api';

const ALLOWED_LOGO_SOURCE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);
const MAX_LOGO_SOURCE_BYTES = 10_000_000;

export type DesignerLogoValue = {
  logoUrl: string | null;
  logoSourceUrl: string | null;
  logoCrop: LogoCropArea | null;
};

type LogoCropSource = {
  source: string;
  fileName: string;
  revokeOnRelease: boolean;
  originalFile?: File;
  initialCrop: LogoCropArea | null;
};

export function DesignerLogoInput({
  buttonRef,
  className,
  displayName,
  id,
  imageAlt,
  onUploaded,
  required = false,
  showLabel = false,
  sizeClassName = 'size-16',
  value,
}: {
  buttonRef?: Ref<HTMLButtonElement>;
  className?: string;
  displayName: string;
  id?: string;
  imageAlt?: string;
  onUploaded: (result: UploadLogoResponse) => Promise<string | null | void> | string | null | void;
  required?: boolean;
  showLabel?: boolean;
  sizeClassName?: string;
  value: DesignerLogoValue;
}) {
  const [isUploading, startUploadTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [managerOpen, setManagerOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [cropSource, setCropSource] = useState<LogoCropSource | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (cropSource?.revokeOnRelease) URL.revokeObjectURL(cropSource.source);
    };
  }, [cropSource]);

  function openLogoEditor() {
    setError(null);
    if (value.logoUrl) {
      setManagerOpen(true);
      return;
    }
    setUploadOpen(true);
  }

  function openCropperForFile(file: File) {
    setError(null);
    if (!ALLOWED_LOGO_SOURCE_TYPES.has(file.type)) {
      setError('Choose a JPEG, PNG, WebP, or AVIF image.');
      return;
    }
    if (file.size > MAX_LOGO_SOURCE_BYTES) {
      setError('Choose an image smaller than 10 MB.');
      return;
    }

    setCropSource({
      source: URL.createObjectURL(file),
      fileName: file.name,
      revokeOnRelease: true,
      originalFile: file,
      initialCrop: null,
    });
    setManagerOpen(false);
    setUploadOpen(false);
    setIsDragging(false);
  }

  function handleFileSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    openCropperForFile(file);
  }

  function handleFileDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) openCropperForFile(file);
  }

  function handleUploadOpenChange(open: boolean) {
    setUploadOpen(open);
    if (!open) {
      setError(null);
      setIsDragging(false);
    }
  }

  function editExistingLogo() {
    if (!value.logoUrl) return;
    setError(null);
    setCropSource({
      source: value.logoSourceUrl ?? value.logoUrl,
      fileName: 'studio-logo.webp',
      revokeOnRelease: false,
      initialCrop: value.logoCrop,
    });
    setManagerOpen(false);
  }

  function chooseAnotherLogo() {
    fileInputRef.current?.click();
  }

  function handleCropDialogOpenChange(open: boolean) {
    if (!open) {
      setCropSource(null);
      setError(null);
    }
  }

  function saveCroppedLogo({
    pixels,
    percentages,
  }: {
    pixels: Parameters<typeof cropImageToFile>[1];
    percentages: LogoCropArea;
  }) {
    if (!cropSource) return;

    startUploadTransition(async () => {
      setError(null);
      try {
        const croppedFile = await cropImageToFile(cropSource.source, pixels, cropSource.fileName);
        const result = await uploadLogo(croppedFile, cropSource.originalFile, percentages);
        const warning = await onUploaded(result);
        setCropSource(null);
        if (warning) setError(warning);
      } catch (uploadError) {
        setError(uploadError instanceof Error ? uploadError.message : 'Could not upload logo.');
      }
    });
  }

  return (
    <div id={id} className={cn('flex shrink-0 flex-col gap-1.5', className)}>
      {showLabel ? (
        <Label className="gap-0 text-sm font-medium text-muted-foreground">
          Logo
          {required ? <RequiredFieldIndicator /> : null}
        </Label>
      ) : null}

      <div className={cn('relative', sizeClassName)}>
        <div className="relative size-full overflow-hidden rounded-lg border border-dashed border-border bg-muted/50 shadow-xs">
          <button
            ref={buttonRef}
            type="button"
            onClick={openLogoEditor}
            disabled={isUploading}
            className="relative flex size-full cursor-pointer items-center justify-center text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={value.logoUrl ? 'Edit logo' : 'Upload logo'}
          >
            {value.logoUrl ? (
              <Image
                src={value.logoUrl}
                alt={imageAlt ?? `${displayName || 'Studio'} logo`}
                fill
                unoptimized
                className="object-cover"
              />
            ) : isUploading ? (
              <Loader2 className="size-6 animate-spin" aria-hidden />
            ) : (
              <ImagePlus className="size-6" aria-hidden />
            )}
          </button>
        </div>
        {value.logoUrl ? (
          <button
            type="button"
            onClick={() =>
              setError('Upload a replacement before removing the logo from your saved portfolio.')
            }
            className="absolute -right-1 -top-1 z-10 flex size-4 items-center justify-center rounded-full bg-muted-foreground/80 text-primary-foreground"
            aria-label="Remove logo"
          >
            <X className="size-2.5" aria-hidden />
          </button>
        ) : null}
      </div>

      {error ? <p className="max-w-64 text-xs font-medium text-destructive">{error}</p> : null}

      <Dialog open={uploadOpen} onOpenChange={handleUploadOpenChange}>
        <DialogContent className="max-h-[calc(100dvh-1rem)] gap-0 overflow-y-auto p-0 sm:max-w-sm">
          <DialogHeader className="sr-only">
            <DialogTitle>Upload logo</DialogTitle>
            <DialogDescription>
              Choose an image to crop and use as your studio logo.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 p-4 sm:p-5">
            <div
              data-testid="logo-upload-dropzone"
              className={cn(
                'flex aspect-square w-full max-w-56 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-muted/40 p-4 text-center transition-colors',
                isDragging && 'border-primary bg-primary/5',
              )}
              onDragEnter={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleFileDrop}
            >
              <div className="flex size-12 items-center justify-center rounded-lg border border-dashed border-border bg-background text-muted-foreground">
                <ImagePlus className="size-5" aria-hidden />
              </div>
              <p className="text-sm font-medium text-foreground">Drag &amp; drop an image</p>
            </div>
            <Button
              type="button"
              variant="fancy"
              size="fancy"
              onClick={() => fileInputRef.current?.click()}
            >
              Browse image
            </Button>
            {error ? (
              <p role="alert" className="text-center text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={managerOpen} onOpenChange={setManagerOpen}>
        <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md">
          <DialogHeader className="border-b border-border px-5 py-3.5 pr-14 text-left">
            <DialogTitle>Studio logo</DialogTitle>
            <DialogDescription>
              Review your saved logo, refine its crop, or choose a replacement.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center p-5">
            <div
              data-testid="saved-logo-preview"
              className="relative aspect-square w-full max-w-48 overflow-hidden rounded-xl border border-border bg-muted"
            >
              {value.logoUrl ? (
                <Image
                  src={value.logoUrl}
                  alt={`${displayName || 'Studio'} logo preview`}
                  fill
                  unoptimized
                  className="object-cover"
                />
              ) : null}
            </div>
          </div>
          <DialogFooter className="border-t border-border px-5 py-3.5">
            <Button type="button" variant="outline" size="sm" onClick={chooseAnotherLogo}>
              <Upload className="size-4" aria-hidden />
              Choose another logo
            </Button>
            <Button type="button" size="sm" onClick={editExistingLogo}>
              <Pencil className="size-4" aria-hidden />
              Edit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <LogoCropDialog
        open={cropSource !== null}
        imageSource={cropSource?.source ?? null}
        initialCrop={cropSource?.initialCrop ?? null}
        isSaving={isUploading}
        error={error}
        onOpenChange={handleCropDialogOpenChange}
        onChooseAnother={chooseAnotherLogo}
        onSave={saveCroppedLogo}
      />

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        className="hidden"
        onChange={handleFileSelected}
      />
    </div>
  );
}
