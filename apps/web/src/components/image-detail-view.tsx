'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { FeedProject, PublicProjectGalleryImage, PublicProjectDesigner, PublicProjectNarrative } from '@repo/contracts';
import {
  BadgeCheck,
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
  project: FeedProject & { description?: string | null; specifications?: unknown };
  gallery: PublicProjectGalleryImage[];
  designer: PublicProjectDesigner;
  narrative: PublicProjectNarrative | null;
  similarProjects: FeedProject[];
  activeImageId: string;
  designerProfileId?: string | null;
  isAuthenticated?: boolean;
}

export function ImageDetailView({
  project,
  gallery,
  designer,
  narrative,
  similarProjects,
  activeImageId,
  designerProfileId,
  isAuthenticated = false,
}: ImageDetailViewProps) {
  const router = useRouter();
  const [selectedImageId, setSelectedImageId] = useState(activeImageId);
  const [bookmarked, setBookmarked] = useState(false);
  const [bookmarkPending, startBookmarkTransition] = useTransition();

  // Check saved state on mount for authenticated users
  useEffect(() => {
    if (!isAuthenticated) return;
    async function checkSavedState() {
      try {
        const response = await fetch(
          `${env.NEXT_PUBLIC_API_URL}/api/saved-projects/state?projectIds=${project.id}`,
          { credentials: 'include' },
        );
        if (!response.ok) return;
        const data = await response.json();
        if (data.savedProjectIds?.includes(project.id)) {
          setBookmarked(true);
        }
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
            anonymousId: crypto.randomUUID(),
          }),
        });
      } catch {
        // Fire-and-forget: analytics failure must not affect UI
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

  // Keyboard navigation for gallery
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (gallery.length <= 1) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        const prevIndex = (activeImageIndex - 1 + gallery.length) % gallery.length;
        selectImage(gallery[prevIndex]!);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
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

  // Bookmark handler
  function handleBookmark() {
    if (!isAuthenticated) {
      router.push(`/login?next=/image/${activeImageId}`);
      return;
    }

    startBookmarkTransition(async () => {
      const newState = !bookmarked;
      // Optimistic update
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
          // Revert on failure
          setBookmarked(!newState);
        }
      } catch {
        // Revert on failure
        setBookmarked(!newState);
      }
    });
  }

  // Share handler
  function handleShare(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const url = `${window.location.origin}/image/${selectedImageId}`;
    if (navigator.share) {
      navigator.share({ title: project.title, url }).catch(() => {});
    } else {
      navigator.clipboard.writeText(url).catch(() => {});
    }
  }

  // About section content
  const aboutText =
    (project as { description?: string | null }).description ||
    narrative?.body ||
    null;

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
                  <svg viewBox="0 0 24 24" className="size-12 text-muted-foreground" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
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

              {/* Designer card */}
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
                    <p className="relative inline-flex items-center text-sm font-semibold">
                      {designer.displayName}
                      <BadgeCheck
                        className="ml-1 size-4 shrink-0 fill-primary text-primary-foreground"
                        aria-label="Verified"
                      />
                    </p>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Star className="size-3 fill-primary text-primary" aria-hidden />
                      <span className="font-medium">{Number(designer.avgRating).toFixed(1)}</span>
                      <span>·</span>
                      <span>{designer.reviewCount} reviews</span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-3">
                  <EnquiryCta
                    context={{
                      type: 'project',
                      projectName: project.title,
                      designerName: designer.displayName,
                      designerLocation: location,
                    }}
                    designerProfileId={designerProfileId ?? ''}
                    loginHref={`/login?next=/image/${activeImageId}`}
                    variant="inverted"
                    className="h-9 flex-[7]"
                  >
                    <MessageSquare aria-hidden />
                    Enquire
                  </EnquiryCta>
                  <Link
                    href={designer.slug ? `/d/${designer.slug}` : '#'}
                    className="flex h-10 flex-[3] items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-accent"
                  >
                    <UserRound className="size-4" aria-hidden />
                    View profile
                  </Link>
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

        {/* Gallery strip */}
        {gallery.length > 1 ? (
          <div className="mt-6 flex gap-3 overflow-x-auto p-1 pb-2 scrollbar-none" role="tablist" aria-label="Project gallery">
            {gallery.map((image, index) => (
              <button
                key={image.id}
                type="button"
                role="tab"
                aria-selected={index === activeImageIndex}
                onClick={() => selectImage(image)}
                className={`relative shrink-0 overflow-hidden rounded-2xl transition-all ${
                  index === activeImageIndex
                    ? 'ring-2 ring-primary ring-offset-2'
                    : 'opacity-80 hover:opacity-100'
                }`}
                aria-label={image.roomName ?? `Image ${index + 1}`}
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

      {/* Similar projects */}
      {similarProjects.length > 0 ? (
        <section className="mt-16 w-full px-5 sm:px-6">
          <h2 className="font-display text-2xl tracking-tight">More like this</h2>
          <div className="mt-3 columns-2 gap-4 md:columns-3 lg:columns-4 xl:columns-5 2xl:columns-6">
            {similarProjects.map((relatedProject) => (
              <ShowcaseCard key={relatedProject.id} project={relatedProject} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
