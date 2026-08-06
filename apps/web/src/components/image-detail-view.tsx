'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { FeedProject, GalleryImage } from '@repo/contracts';
import { Button } from '@repo/ui/components/button';
import {
  BadgeCheck,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Eye,
  Flag,
  MessageSquare,
  Share2,
  Star,
  UserRound,
} from 'lucide-react';
import { ShowcaseCard } from '@/components/showcase-card';

interface ImageDetailViewProps {
  project: FeedProject;
  gallery: GalleryImage[];
  moreProjects: FeedProject[];
  activeImageId: string;
}

export function ImageDetailView({
  project,
  gallery,
  moreProjects,
  activeImageId,
}: ImageDetailViewProps) {
  const router = useRouter();
  const [selectedImageId, setSelectedImageId] = useState(activeImageId);
  const [bookmarked, setBookmarked] = useState(false);
  const [shared, setShared] = useState(false);
  const [reported, setReported] = useState(false);

  useEffect(() => {
    setSelectedImageId(activeImageId);
  }, [activeImageId]);

  const location = [project.locality, project.city].filter(Boolean).join(', ') || null;
  const displayGallery = gallery;

  const activeImageIndex = useMemo(() => {
    const selectedIndex = displayGallery.findIndex((image) => image.id === selectedImageId);
    if (selectedIndex >= 0) return selectedIndex;

    const initialIndex = displayGallery.findIndex((image) => image.id === activeImageId);
    return initialIndex >= 0 ? initialIndex : 0;
  }, [activeImageId, displayGallery, selectedImageId]);

  const activeImage = displayGallery[activeImageIndex] ?? null;
  const mainImageUrl =
    activeImage?.url ??
    project.coverImageUrl ??
    `https://picsum.photos/seed/${project.slug}/800/600`;

  const mainImageAlt = activeImage
    ? `${project.title}${activeImage.roomName ? `, ${activeImage.roomName}` : ''}`
    : project.title;

  function selectImage(image: GalleryImage) {
    setSelectedImageId(image.id);
    router.push(`/image/${image.id}`, { scroll: false });
  }

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
          <div className="h-full w-full lg:w-[65%]">
            <div className="relative h-full overflow-hidden rounded-2xl bg-muted">
              <img
                src={mainImageUrl}
                alt={mainImageAlt}
                className="h-full w-full select-none object-cover"
                draggable={false}
                onContextMenu={(event) => event.preventDefault()}
                onDragStart={(event) => event.preventDefault()}
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-foreground/80 to-transparent p-6">
                <h1 className="font-display text-2xl tracking-tight text-background md:text-3xl">
                  {project.title}
                </h1>
              </div>
            </div>
          </div>

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

              <div className="rounded-xl bg-muted/70 p-4">
                <div className="flex items-center gap-3">
                  <div className="grid size-11 place-items-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                    {project.studio.charAt(0)}
                  </div>
                  <div className="flex-1">
                    <p className="relative inline-flex items-center text-sm font-semibold">
                      {project.studio}
                      <BadgeCheck
                        className="ml-1 size-4 shrink-0 fill-primary text-primary-foreground"
                        aria-label="Verified"
                      />
                    </p>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span aria-hidden className="font-bold text-primary">
                        <Star className="size-3 fill-primary" />
                      </span>
                      <span className="font-medium">{project.rating.toFixed(1)}</span>
                      <span>·</span>
                      <span>{project.reviewCount} reviews</span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-3">
                  <Button type="button" variant="inverted" size="compact" className="h-9 flex-[7]">
                    <MessageSquare aria-hidden />
                    Enquire
                  </Button>
                  <button
                    type="button"
                    className="flex h-10 flex-[3] items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-accent"
                  >
                    <UserRound className="size-4" aria-hidden />
                    View profile
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setBookmarked((prev) => !prev)}
                  aria-pressed={bookmarked}
                  className={`flex flex-1 items-center justify-center rounded-xl bg-muted/70 py-2.5 transition-colors hover:text-primary ${
                    bookmarked ? 'text-primary' : 'text-foreground'
                  }`}
                  aria-label="Bookmark"
                >
                  <Bookmark className={bookmarked ? 'size-4 fill-current' : 'size-4'} aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => setShared((prev) => !prev)}
                  aria-pressed={shared}
                  className={`flex flex-1 items-center justify-center rounded-xl bg-muted/70 py-2.5 transition-colors hover:text-primary ${
                    shared ? 'text-primary' : 'text-foreground'
                  }`}
                  aria-label="Share"
                >
                  <Share2 className={shared ? 'size-4 fill-current' : 'size-4'} aria-hidden />
                </button>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4 text-sm text-foreground">
                  <span className="flex items-center gap-1.5">
                    <Eye className="size-4" aria-hidden />
                    {project.reviewCount}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Bookmark className="size-4" aria-hidden />
                    {bookmarked ? 1 : 0}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setReported(true)}
                  aria-pressed={reported}
                  className={`flex items-center gap-1.5 text-sm transition-colors hover:text-destructive ${
                    reported ? 'text-destructive' : 'text-muted-foreground'
                  }`}
                  aria-label="Report"
                >
                  <Flag className={reported ? 'size-4 fill-current' : 'size-4'} aria-hidden />
                  Report
                </button>
              </div>

              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  About this project
                </p>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  A beautifully designed space that blends functionality with aesthetics. More
                  details coming soon.
                </p>
              </div>

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

        {displayGallery.length > 1 ? (
          <div className="mt-6 flex gap-3 overflow-x-auto p-1 pb-2 scrollbar-none">
            {displayGallery.map((image, index) => (
              <button
                key={image.id}
                type="button"
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
