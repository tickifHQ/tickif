'use client';

import { useCallback, useEffect, useState } from 'react';

type FeedProject = {
  id: string;
  slug: string;
  title: string;
  studio: string;
  city: string | null;
  locality: string | null;
  rating: number;
  budget: string | null;
  tags: string[];
  coverImageUrl: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
};

type GalleryImage = {
  id: string;
  url: string;
  width: number | null;
  height: number | null;
  roomName: string | null;
};

const FALLBACK_WIDTH = 480;
const FALLBACK_HEIGHT = 600;
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

/**
 * Shared props to prevent image downloading via common browser methods:
 * - onContextMenu: blocks right-click "Save Image As"
 * - draggable: prevents drag-to-desktop / drag-to-another-tab
 * - onDragStart: fallback for browsers that ignore draggable="false"
 * - style properties: disable text/image selection and webkit drag
 */
const imageProtectionProps = {
  onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  draggable: false as const,
  onDragStart: (e: React.DragEvent) => e.preventDefault(),
};

export function ShowcaseCard({ project }: { project: FeedProject }) {
  const [gallery, setGallery] = useState<GalleryImage[] | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const width = project.imageWidth ?? FALLBACK_WIDTH;
  const height = project.imageHeight ?? FALLBACK_HEIGHT;
  const imageUrl = project.coverImageUrl ?? `https://picsum.photos/seed/${project.slug}/${width}/${height}`;
  const location = [project.locality, project.city].filter(Boolean).join(', ') || null;

  async function handleCardClick() {
    setLightboxOpen(true);
    setCurrentIndex(0);
    if (!gallery) {
      setLoading(true);
      try {
        const res = await fetch(`${API_URL}/api/projects/${project.id}/gallery`);
        if (res.ok) {
          const data = await res.json();
          setGallery(data.images ?? []);
        }
      } catch {
        // Fallback: just show the cover
        setGallery([{ id: 'cover', url: imageUrl, width, height, roomName: null }]);
      } finally {
        setLoading(false);
      }
    }
  }

  function closeLightbox() {
    setLightboxOpen(false);
  }

  const goNext = useCallback(() => {
    if (gallery) setCurrentIndex((i) => (i + 1) % gallery.length);
  }, [gallery]);

  const goPrev = useCallback(() => {
    if (gallery) setCurrentIndex((i) => (i - 1 + gallery.length) % gallery.length);
  }, [gallery]);

  // Keyboard navigation
  useEffect(() => {
    if (!lightboxOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowRight') goNext();
      if (e.key === 'ArrowLeft') goPrev();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [lightboxOpen, goNext, goPrev]);

  // Prevent body scroll when lightbox is open
  useEffect(() => {
    if (lightboxOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [lightboxOpen]);

  const currentImage = gallery?.[currentIndex];

  return (
    <>
      <article
        className="group relative mb-4 block cursor-pointer break-inside-avoid overflow-hidden rounded-xl bg-[#e9e2d0]"
        onClick={handleCardClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleCardClick(); }}
      >
        <img
          src={imageUrl}
          alt={project.title}
          loading="lazy"
          className="w-full object-cover pointer-events-none select-none"
          style={{ aspectRatio: `${width} / ${height}`, WebkitUserDrag: 'none' } as React.CSSProperties}
          {...imageProtectionProps}
        />
        {/* Transparent overlay to intercept right-click/long-press on the image area */}
        <div className="absolute inset-0" onContextMenu={(e) => e.preventDefault()} />

        {project.budget && (
          <span className="absolute bottom-3 left-3 rounded-full bg-background/95 px-2.5 py-1 font-mono text-[11px] font-medium text-foreground shadow-sm transition-opacity group-hover:opacity-0 sm:opacity-100">
            {project.budget}
          </span>
        )}

        <div className="absolute right-3 top-3 flex gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
          <button type="button" aria-label="Save" className="grid size-8 place-items-center rounded-full bg-white/95 text-foreground shadow-md backdrop-blur" onClick={(e) => e.stopPropagation()}>
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M12 21s-7-4.35-9.5-8.5C.5 9 2 5.5 5.5 5.5c2 0 3.5 1.5 6.5 4.5 3-3 4.5-4.5 6.5-4.5C22 5.5 23.5 9 21.5 12.5 19 16.65 12 21 12 21Z" />
            </svg>
          </button>
          <button type="button" aria-label="Share" className="grid size-8 place-items-center rounded-full bg-white/95 text-foreground shadow-md backdrop-blur" onClick={(e) => e.stopPropagation()}>
            <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
              <path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" />
            </svg>
          </button>
        </div>

        <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-b from-transparent via-transparent to-[#0f0c05]/80 p-[18px] opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
          <h3 className="font-display text-xl leading-tight tracking-tight text-white">{project.title}</h3>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px] text-white/90">
            <span className="whitespace-nowrap">{project.studio}</span>
            {location && (
              <>
                <span className="text-white/50">·</span>
                <span className="whitespace-nowrap">{location}</span>
              </>
            )}
            <span className="whitespace-nowrap">
              <span className="text-white/50">·</span> <span aria-hidden className="text-amber-300">★</span>{' '}
              {project.rating.toFixed(1)}
            </span>
          </div>
          {project.tags.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-1">
              {project.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-white/[0.18] px-2 py-[3px] text-[10.5px] font-medium tracking-[0.21px] text-white backdrop-blur-sm"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </article>

      {/* Fullscreen gallery lightbox */}
      {lightboxOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={closeLightbox}
          role="dialog"
          aria-label={`${project.title} gallery`}
        >
          {/* Close button */}
          <button
            type="button"
            className="absolute right-4 top-4 z-10 grid size-10 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
            onClick={closeLightbox}
            aria-label="Close gallery"
          >
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>

          {/* Image counter */}
          {gallery && gallery.length > 1 && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-xs font-medium text-white">
              {currentIndex + 1} / {gallery.length}
            </div>
          )}

          {/* Left arrow */}
          {gallery && gallery.length > 1 && (
            <button
              type="button"
              className="absolute left-4 top-1/2 -translate-y-1/2 grid size-12 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
              onClick={(e) => { e.stopPropagation(); goPrev(); }}
              aria-label="Previous image"
            >
              <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}

          {/* Right arrow */}
          {gallery && gallery.length > 1 && (
            <button
              type="button"
              className="absolute right-4 top-1/2 -translate-y-1/2 grid size-12 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
              onClick={(e) => { e.stopPropagation(); goNext(); }}
              aria-label="Next image"
            >
              <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}

          {/* Main image */}
          <div className="relative flex max-h-[85vh] max-w-[85vw] flex-col items-center" onClick={(e) => e.stopPropagation()}>
            {loading ? (
              <div className="flex items-center justify-center">
                <div className="size-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
              </div>
            ) : currentImage ? (
              <img
                src={currentImage.url}
                alt={`${project.title}${currentImage.roomName ? ` — ${currentImage.roomName}` : ''}`}
                className="max-h-[75vh] max-w-full rounded-lg object-contain pointer-events-none select-none"
                style={{ WebkitUserDrag: 'none' } as React.CSSProperties}
                {...imageProtectionProps}
              />
            ) : (
              <img
                src={imageUrl}
                alt={project.title}
                className="max-h-[75vh] max-w-full rounded-lg object-contain pointer-events-none select-none"
                style={{ WebkitUserDrag: 'none' } as React.CSSProperties}
                {...imageProtectionProps}
              />
            )}
            {/* Transparent overlay to block long-press/touch-hold "Save Image" on mobile */}
            {!loading && (
              <div
                className="absolute inset-0 rounded-lg"
                onContextMenu={(e) => e.preventDefault()}
                style={{ touchAction: 'pan-x' }}
              />
            )}
            <div className="mt-4 text-center">
              <h3 className="text-lg font-medium text-white">{project.title}</h3>
              <p className="mt-1 text-sm text-white/70">
                {project.studio}{location ? ` · ${location}` : ''}
                {currentImage?.roomName && <span className="text-white/50"> · {currentImage.roomName}</span>}
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
