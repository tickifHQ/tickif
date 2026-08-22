'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { FeedProject, PublicProjectGalleryImage, PublicProjectDesigner, PublicProjectNarrative, PublicImageDetailProject } from '@repo/contracts';
import {
  Bookmark,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  Share2,
  Star,
  UserRound,
} from 'lucide-react';
import { ShowcaseCard } from '@/components/showcase-card';
import { EnquiryCta } from '@/components/enquiry-cta';
import { env } from '@/env';

interface ImageDetailViewProps {
  /** The project data from the image-detail response (PublicImageDetailProject). */
  project: PublicImageDetailProject;
  gallery: PublicProjectGalleryImage[];
  designer: PublicProjectDesigner;
  narrative: PublicProjectNarrative | null;
  moreProjects: FeedProject[];
  activeImageId: string;
  designerProfileId: string;
  isAuthenticated?: boolean;
}

const ANONYMOUS_ID_STORAGE_KEY = 'tickif.anonymousId';

/**
 * Reads (or lazily creates) the stable pseudonymous visitor id behind
 * `interaction_event.anonymous_id`. It has to survive page loads: minting a
 * fresh uuid per view would make `count(distinct anonymous_id)` degenerate to
 * `count(*)`, and the table is append-only so that is not backfillable.
 */
function getAnonymousId(): string {
  try {
    const existing = window.localStorage.getItem(ANONYMOUS_ID_STORAGE_KEY);
    if (existing) return existing;
    const created = crypto.randomUUID();
    window.localStorage.setItem(ANONYMOUS_ID_STORAGE_KEY, created);
    return created;
  } catch {
    // Storage unavailable (private mode / blocked cookies) — fall back to a
    // throwaway id rather than dropping the view record.
    return crypto.randomUUID();
  }
}

/**
 * Returns true if the keyboard event target is an interactive element where
 * arrow keys should NOT be intercepted (inputs, textareas, contenteditable).
 */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return false;
}

export function ImageDetailView({
  project,
  gallery,
  designer,
  narrative,
  moreProjects,
  activeImageId,
  designerProfileId,
  isAuthenticated = false,
}: ImageDetailViewProps) {
  const router = useRouter();
  const [selectedImageId, setSelectedImageId] = useState(activeImageId);
  const [bookmarked, setBookmarked] = useState(false);
  const [bookmarkPending, startBookmarkTransition] = useTransition();
  const savedStateVersion = useRef(0);

  // Finding #5: Check saved state on mount with cancellation/ignore handling
  useEffect(() => {
    if (!isAuthenticated) return;
    const version = ++savedStateVersion.current;
    async function checkSavedState() {
      try {
        const response = await fetch(
          `${env.NEXT_PUBLIC_API_URL}/api/saved-projects/state?projectIds=${project.id}`,
          { credentials: 'include' },
        );
        if (!response.ok) return;
        const data = await response.json();
        // Re-check after every await: a bookmark click during the body read
        // must still win over this response.
        if (version !== savedStateVersion.current) return; // Stale response
        setBookmarked(data.savedProjectIds?.includes(project.id) ?? false);
      } catch {
        // Non-blocking
      }
    }
    checkSavedState();
  }, [isAuthenticated, project.id]);

  // Record page view for authenticated users (fire-and-forget)
  useEffect(() => {
    if (!isAuthenticated) return;
    async function recordView() {
      try {
        await fetch(`${env.NEXT_PUBLIC_API_URL}/api/interactions/views`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'project_view',
            projectId: project.id,
            eventKey: crypto.randomUUID(),
            anonymousId: getAnonymousId(),
          }),
        });
      } catch {
        // Fire-and-forget
      }
    }
    recordView();
  }, [isAuthenticated, project.id]);

  useEffect(() => {
    setSelectedImageId(activeImageId);
  }, [activeImageId]);

  const location = [project.locality, project.city].filter(Boolean).join(', ') || null;

  const activeImageIndex = useMemo(() => {
    const selectedIndex = gallery.findIndex((image) => image.id === selectedImageId);
    if (selectedIndex >= 0) return selectedIndex;
    const initialIndex = gallery.findIndex((image) => image.id === activeImageId);
    return initialIndex >= 0 ? initialIndex : 0;
  }, [activeImageId, gallery, selectedImageId]);

  const activeImage = gallery[activeImageIndex] ?? null;
  const mainImageUrl = activeImage?.url ?? project.coverImageUrl ?? null;
  const mainImageAlt = activeImage
    ? `${project.title}${activeImage.roomName ? `, ${activeImage.roomName}` : ''}`
    : project.title;

  function selectImage(image: PublicProjectGalleryImage) {
    setSelectedImageId(image.id);
    router.push(`/image/${image.id}`, { scroll: false });
  }

  // Finding #1: Keyboard navigation — scoped, with guards
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (gallery.length <= 1) return;
      if (e.repeat) return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (isEditableTarget(e.target)) return;
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;

      e.preventDefault();
      if (e.key === 'ArrowLeft') {
        const prevIndex = (activeImageIndex - 1 + gallery.length) % gallery.length;
        selectImage(gallery[prevIndex]!);
      } else {
        const nextIndex = (activeImageIndex + 1) % gallery.length;
        selectImage(gallery[nextIndex]!);
      }
    },
    [activeImageIndex, gallery],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Finding #2: Bookmark handler — uses callbackURL (not next=)
  function handleBookmark() {
    if (!isAuthenticated) {
      router.push(`/login?callbackURL=${encodeURIComponent(`/image/${selectedImageId}`)}`);
      return;
    }

    // Invalidate any in-flight saved-state check
    savedStateVersion.current++;

    startBookmarkTransition(async () => {
      const newState = !bookmarked;
      setBookmarked(newState);
      try {
        const response = await fetch(
          `${env.NEXT_PUBLIC_API_URL}/api/saved-projects/${project.id}`,
          {
            method: newState ? 'PUT' : 'DELETE',
            credentials: 'include',
          },
        );
        if (!response.ok) {
          setBookmarked(!newState);
        }
      } catch {
        setBookmarked(!newState);
      }
    });
  }

  // Share handler — both APIs are undefined outside a secure context (e.g.
  // testing on a phone against http://192.168.x.x), so feature-detect each one
  // and keep the whole thing inside async/try so nothing throws synchronously.
  async function handleShare(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const url = `${window.location.origin}/image/${selectedImageId}`;
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ title: project.title, url });
        return;
      }
      if (typeof navigator.clipboard?.writeText === 'function') {
        await navigator.clipboard.writeText(url);
      }
    } catch {
      // Share sheet dismissed (AbortError) or clipboard permission denied.
    }
  }

  // Finding #9: Use contract type directly — description is on PublicImageDetailProject
  const aboutText = project.description || narrative?.body || null;

  // Finding #8: Only show rating if designer has reviews
  const hasRating = designer.reviewCount > 0 && Number(designer.avgRating) > 0;

  return (
    <div className="w-full py-8">
      <div className="mx-auto w-full max-w-[1512px] px-6 lg:px-10">
        <nav className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Link
            href="/"
            className="flex items-center gap-1 transition-colors hover:text-foreground"
          >
            <ChevronLeft className="size-4" aria-hidden />
            Back to results
          </Link>
          <span className="text-muted-foreground/50">›</span>
          <span className="truncate font-medium text-foreground">{project.title}</span>
        </nav>

        <div className="flex flex-col gap-8 lg:h-[65vh] lg:flex-row">
          {/* Hero image */}
          <div className="h-full w-full lg:w-[65%]">
            <div className="relative h-full overflow-hidden rounded-2xl bg-muted">
              {mainImageUrl ? (
                <img
                  src={mainImageUrl}
                  alt={mainImageAlt}
                  className="h-full w-full select-none object-cover"
                  draggable={false}
                  onContextMenu={(event) => event.preventDefault()}
                  onDragStart={(event) => event.preventDefault()}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-muted">
                  <svg data-testid="image-placeholder" viewBox="0 0 24 24" className="size-12 text-muted-foreground" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <circle cx="9" cy="9" r="1.5" />
                    <path d="m21 15-5-5L5 21" />
                  </svg>
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-foreground/80 to-transparent p-6">
                <h1 className="font-display text-2xl tracking-tight text-background md:text-3xl">
                  {project.title}
                </h1>
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <aside className="h-full w-full overflow-y-auto lg:w-[35%]">
            <div className="space-y-5">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight">{project.title}</h2>
                {location ? (
                  <p className="mt-1.5 text-sm font-semibold text-muted-foreground">
                    {location}
                    {project.tags.length > 0 ? (
                      <>
                        <span className="mx-1.5">·</span>
                        <span>{project.tags[0]}</span>
                      </>
                    ) : null}
                  </p>
                ) : null}
              </div>

              {/* Designer card — Finding #8: no fabricated badge/rating */}
              <div className="rounded-xl bg-muted/70 p-4">
                <div className="flex items-center gap-3">
                  <div className="grid size-11 place-items-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                    {designer.logoUrl ? (
                      <img src={designer.logoUrl} alt="" className="size-11 rounded-full object-cover" />
                    ) : (
                      designer.displayName.charAt(0)
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold">
                      {designer.displayName}
                    </p>
                    {hasRating ? (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Star className="size-3 fill-primary text-primary" aria-hidden />
                        <span className="font-medium">{Number(designer.avgRating).toFixed(1)}</span>
                        <span>·</span>
                        <span>{designer.reviewCount} reviews</span>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        {designer.projectCount} project{designer.projectCount !== 1 ? 's' : ''}
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-3">
                  {/* Finding #2: loginHref uses callbackURL */}
                  <EnquiryCta
                    context={{
                      type: 'project',
                      projectName: project.title,
                      designerName: designer.displayName,
                      designerLocation: location,
                    }}
                    designerProfileId={designerProfileId}
                    loginHref={`/login?callbackURL=${encodeURIComponent(`/image/${selectedImageId}`)}`}
                    variant="inverted"
                    className="h-9 flex-[7]"
                  >
                    <MessageSquare aria-hidden />
                    Enquire
                  </EnquiryCta>
                  {/* Finding #6: don't render dead # link */}
                  {designer.slug ? (
                    <Link
                      href={`/d/${designer.slug}`}
                      className="flex h-10 flex-[3] items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-accent"
                    >
                      <UserRound className="size-4" aria-hidden />
                      View profile
                    </Link>
                  ) : (
                    <span
                      className="flex h-10 flex-[3] items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-border bg-muted px-4 text-sm font-medium text-muted-foreground opacity-50"
                      aria-disabled="true"
                    >
                      <UserRound className="size-4" aria-hidden />
                      View profile
                    </span>
                  )}
                </div>
              </div>

              {/* Action buttons: bookmark + share */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleBookmark}
                  disabled={bookmarkPending}
                  aria-pressed={bookmarked}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-xl bg-muted/70 py-2.5 transition-colors hover:text-primary disabled:opacity-50 ${
                    bookmarked ? 'text-primary' : 'text-foreground'
                  }`}
                  aria-label={bookmarked ? 'Remove bookmark' : 'Bookmark this project'}
                >
                  <Bookmark className={bookmarked ? 'size-4 fill-current' : 'size-4'} aria-hidden />
                  <span className="text-xs font-medium">{bookmarked ? 'Saved' : 'Save'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleShare}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-muted/70 py-2.5 text-foreground transition-colors hover:text-primary"
                  aria-label="Share this project"
                >
                  <Share2 className="size-4" aria-hidden />
                  <span className="text-xs font-medium">Share</span>
                </button>
              </div>

              {/* About this project */}
              {aboutText ? (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    About this project
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {aboutText}
                  </p>
                </div>
              ) : null}

              <Link
                href={`/projects/${project.id}`}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-medium text-primary-foreground shadow-md transition-colors hover:bg-primary/90"
              >
                Visit full project
                <ChevronRight className="size-4" aria-hidden />
              </Link>
            </div>
          </aside>
        </div>

        {/* Finding #7: Gallery strip — use aria-current instead of incomplete tab pattern */}
        {gallery.length > 1 ? (
          <div className="mt-6 flex gap-3 overflow-x-auto p-1 pb-2 scrollbar-none" role="group" aria-label="Project gallery">
            {gallery.map((image, index) => (
              <button
                key={image.id}
                type="button"
                aria-current={index === activeImageIndex ? 'true' : undefined}
                onClick={() => selectImage(image)}
                className={`relative shrink-0 overflow-hidden rounded-2xl transition-all ${
                  index === activeImageIndex
                    ? 'ring-2 ring-primary ring-offset-2'
                    : 'opacity-80 hover:opacity-100'
                }`}
                aria-label={image.roomName ?? `Image ${index + 1} of ${gallery.length}`}
              >
                <img
                  src={image.url}
                  alt={image.roomName ?? `${project.title}, ${index + 1}`}
                  className="h-28 w-40 select-none object-cover"
                  draggable={false}
                  onContextMenu={(event) => event.preventDefault()}
                  onDragStart={(event) => event.preventDefault()}
                />
                <span className="absolute left-2 top-2 rounded-md bg-foreground/80 px-2 py-0.5 text-xs font-semibold text-background">
                  {String(index + 1).padStart(2, '0')}
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {/* More like this (similar projects or recommendation fallback) */}
      {moreProjects.length > 0 ? (
        <section className="mt-16 w-full px-5 sm:px-6">
          <h2 className="font-display text-2xl tracking-tight">More like this</h2>
          <div className="mt-3 columns-2 gap-4 md:columns-3 lg:columns-4 xl:columns-5 2xl:columns-6">
            {moreProjects.map((relatedProject) => (
              <ShowcaseCard key={relatedProject.id} project={relatedProject} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
