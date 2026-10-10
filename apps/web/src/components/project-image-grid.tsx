'use client';

import { useEffect, useId, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ImagePlus, Loader2, RefreshCw, Star, Trash2 } from 'lucide-react';
import { Button } from '@repo/ui/components/button';
import { cn } from '@repo/ui/lib/utils';
import {
  imageFailureMessage,
  isLocalPreviewImage,
  type ProjectImagePreview,
} from '@/lib/designer-project-upload';

type ProjectImageGridProps = {
  images: ProjectImagePreview[];
  roomTitle: string;
  coverImageId: string | null;
  uploading: boolean;
  onMove: (imageId: string, targetImageId: string) => Promise<void>;
  onOpen: (image: ProjectImagePreview, statusLabel: string) => void;
  onSetCover: (imageId: string) => void;
  onRemove: (imageId: string) => void;
  onRetry: (imageId: string) => void;
};

const controlClass =
  'size-11 rounded-full border border-border/60 bg-background/95 text-foreground shadow-sm hover:bg-background focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50';

export function ProjectImageGrid(props: ProjectImageGridProps) {
  const { images, roomTitle, onMove } = props;
  const id = useId();
  const [announcementContainer, setAnnouncementContainer] = useState<HTMLElement>();
  // Radix preserves live-region ancestors when hiding the page behind a dialog.
  // Keep drag announcements outside the form so its controls remain hidden.
  useEffect(() => setAnnouncementContainer(document.body), []);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: { start: ['Space'], end: ['Space'], cancel: ['Escape'] },
    }),
  );
  const activeImage = images.find((image) => image.id === activeId);
  const disabled = saving || props.uploading;
  const position = (imageId: string | number) =>
    images.findIndex((image) => image.id === imageId) + 1;

  if (images.length === 0) return null;

  return (
    <DndContext
      id={id}
      sensors={sensors}
      collisionDetection={closestCenter}
      accessibility={{
        container: announcementContainer,
        screenReaderInstructions: {
          draggable:
            'To reorder a photo, press Space, use the arrow keys to move, then press Space to drop. Press Escape to cancel. Press Enter to open the photo.',
        },
        announcements: {
          onDragStart: ({ active }) =>
            `Picked up photo ${position(active.id)} of ${images.length}.`,
          onDragOver: ({ over }) =>
            over
              ? `Move to position ${position(over.id)} of ${images.length}.`
              : 'Outside the photo grid.',
          onDragEnd: ({ over }) =>
            over ? `Dropped at position ${position(over.id)}.` : 'Photo order unchanged.',
          onDragCancel: () => 'Reordering cancelled. Photo order unchanged.',
        },
      }}
      onDragStart={({ active }) => setActiveId(String(active.id))}
      onDragCancel={() => setActiveId(null)}
      onDragEnd={async ({ active, over }) => {
        setActiveId(null);
        if (!over || active.id === over.id || disabled) return;
        setSaving(true);
        try {
          await onMove(String(active.id), String(over.id));
        } finally {
          setSaving(false);
        }
      }}
    >
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <p>Drag images to reorder photos</p>
          {saving ? (
            <span role="status" className="inline-flex items-center gap-1.5">
              <Loader2 className="size-3 animate-spin" />
              Saving order…
            </span>
          ) : null}
        </div>
        <SortableContext items={images} strategy={rectSortingStrategy}>
          <ul aria-label={`${roomTitle} photos`} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {images.map((image, index) => (
              <SortablePhoto
                key={image.id}
                coverImageId={props.coverImageId}
                uploading={props.uploading}
                onOpen={props.onOpen}
                onSetCover={props.onSetCover}
                onRemove={props.onRemove}
                onRetry={props.onRetry}
                canReorder={images.length > 1}
                image={image}
                index={index}
                disabled={disabled}
              />
            ))}
          </ul>
        </SortableContext>
      </div>
      {activeImage
        ? createPortal(
            <DragOverlay dropAnimation={null}>
              <div
                aria-hidden="true"
                className="aspect-[4/3] overflow-hidden rounded-xl border-2 border-primary bg-muted shadow-xl"
              >
                <PhotoPreview image={activeImage} />
              </div>
            </DragOverlay>,
            document.body,
          )
        : null}
    </DndContext>
  );
}

function PhotoPreview({ image }: { image: ProjectImagePreview }) {
  return image.previewUrl ? (
    <div
      role="img"
      aria-label={`${image.fileName} (${image.status === 'ready' ? 'Ready' : image.status === 'processing' ? 'Processing' : 'Failed'})`}
      className="h-full w-full bg-cover bg-center"
      style={{ backgroundImage: `url(${image.previewUrl})` }}
    />
  ) : (
    <div className="flex h-full w-full items-center justify-center bg-muted text-muted-foreground">
      <ImagePlus className="size-8" aria-hidden="true" />
      <span className="sr-only">{image.fileName}</span>
    </div>
  );
}

function SortablePhoto({
  image,
  index,
  disabled,
  canReorder,
  ...props
}: Pick<
  ProjectImageGridProps,
  'coverImageId' | 'uploading' | 'onOpen' | 'onSetCover' | 'onRemove' | 'onRetry'
> & {
  image: ProjectImagePreview;
  index: number;
  disabled: boolean;
  canReorder: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: image.id,
    disabled: disabled || !canReorder,
  });
  const isCover = props.coverImageId === image.id;
  const statusLabel =
    image.status === 'ready' ? 'Ready' : image.status === 'processing' ? 'Processing' : 'Failed';
  const failureDetail =
    image.transferError ??
    imageFailureMessage(image.failureReason) ??
    'Processing failed. Try uploading this photo again.';

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('min-w-0 rounded-xl motion-reduce:transition-none', isDragging && 'opacity-30')}
      aria-label={image.fileName}
    >
      <div
        className={cn(
          'relative aspect-[4/3] overflow-hidden rounded-xl border bg-muted',
          isCover ? 'border-primary ring-2 ring-primary/30' : 'border-border',
        )}
      >
        <button
          ref={setActivatorNodeRef}
          type="button"
          className="absolute inset-0 size-full select-none cursor-grab active:cursor-grabbing focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-ring"
          {...attributes}
          {...listeners}
          aria-disabled={disabled}
          disabled={!image.previewUrl && !canReorder}
          onClick={() => {
            if (image.previewUrl && !disabled) props.onOpen(image, statusLabel);
          }}
          aria-label={`Open ${image.fileName}`}
        >
          <PhotoPreview image={image} />
        </button>
        <div className="pointer-events-none absolute top-3 left-3 flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-full bg-background/95 text-xs font-medium text-foreground shadow-sm">
            {index + 1}
          </span>
          {isCover ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground shadow-sm">
              <Star className="size-3 fill-current" />
              Cover
            </span>
          ) : null}
        </div>
        {image.status !== 'ready' ? (
          <span
            className={cn(
              'absolute top-3 right-3 rounded-full bg-background/95 px-2.5 py-1 text-xs shadow-sm',
              image.status === 'failed' ? 'text-destructive' : 'text-muted-foreground',
            )}
          >
            {statusLabel}
          </span>
        ) : (
          <span className="sr-only">Ready</span>
        )}
        <div className="absolute right-3 bottom-3 flex gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn(controlClass, isCover && 'text-primary')}
            disabled={disabled || isLocalPreviewImage(image)}
            onClick={() => props.onSetCover(image.id)}
            aria-label={
              isCover ? `${image.fileName} is the cover` : `Set ${image.fileName} as cover`
            }
            aria-pressed={isCover}
            title={isCover ? 'Cover photo' : 'Set as cover'}
          >
            <Star className={cn('size-4', isCover && 'fill-current')} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn(controlClass, 'hover:text-destructive')}
            disabled={disabled}
            onClick={() => props.onRemove(image.id)}
            aria-label={`Remove ${image.fileName}`}
            title="Remove photo"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
        {image.status === 'processing' ? (
          <span
            className="pointer-events-none absolute inset-x-0 bottom-0 h-1 animate-pulse bg-primary/70"
            aria-hidden="true"
          />
        ) : null}
      </div>
      {image.status === 'failed' ? (
        <div className="mt-2 space-y-2 text-xs">
          <p role="status" className="text-destructive">
            {failureDetail}
          </p>
          {image.file && image.failureReason !== 'too_large' && !props.uploading ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => props.onRetry(image.id)}
            >
              <RefreshCw className="size-3" />
              Retry upload
            </Button>
          ) : (
            <p className="text-muted-foreground">
              {image.failureReason === 'too_large'
                ? 'Remove this photo and choose a smaller file.'
                : 'Remove this photo and upload it again to recover.'}
            </p>
          )}
        </div>
      ) : null}
    </li>
  );
}
