'use client';

import { useState } from 'react';
import Link from 'next/link';
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
import { EnquiryCta } from '@/components/enquiry-cta';

interface ProjectDetailViewProps {
  project: FeedProject;
  gallery: GalleryImage[];
  moreProjects: FeedProject[];
  designerProfileId?: string | null;
}

export function ProjectDetailView({ project, gallery, moreProjects, designerProfileId }: ProjectDetailViewProps) {
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [bookmarked, setBookmarked] = useState(false);
  const [shared, setShared] = useState(false);
  const [reported, setReported] = useState(false);

  const location = [project.locality, project.city].filter(Boolean).join(', ') || null;

  // Use actual gallery images (no duplicates)
  const displayGallery = gallery;

  const mainImageUrl =
    displayGallery.length > 0
      ? displayGallery[activeImageIndex]?.url
      : (project.coverImageUrl ?? `https://picsum.photos/seed/${project.slug}/800/600`);

  const mainImageAlt =
    displayGallery.length > 0
      ? `${project.title}${displayGallery[activeImageIndex]?.roomName ? ` — ${displayGallery[activeImageIndex]?.roomName}` : ''}`
      : project.title;

  return (
    <div className="mx-auto w-full max-w-[1512px] px-6 py-8 lg:px-10">
      {/* Breadcrumb */}
      <nav className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/" className="flex items-center gap-1 hover:text-foreground transition-colors">
          <ChevronLeft className="size-4" aria-hidden />
          Back to results
        </Link>
        <span className="text-muted-foreground/50">›</span>
        <span className="text-foreground font-medium truncate">{project.title}</span>
      </nav>

      {/* Main content: image + details panel — fixed height */}
      <div className="flex flex-col gap-8 lg:flex-row lg:h-[65vh]">
        {/* Cover image — 60-70% width, fixed height */}
        <div className="w-full lg:w-[65%] h-full">
          <div className="relative h-full overflow-hidden rounded-2xl bg-muted">
            <img
              src={mainImageUrl}
              alt={mainImageAlt}
              className="h-full w-full object-cover select-none"
              draggable={false}
              onContextMenu={(e) => e.preventDefault()}
              onDragStart={(e) => e.preventDefault()}
            />
            {/* Title overlay at bottom of image */}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-6">
              <h1 className="font-display text-2xl tracking-tight text-white md:text-3xl">
                {project.title}
              </h1>
            </div>
          </div>
        </div>

        {/* Details panel — 30-40% width, fixed height with scroll */}
        <aside className="w-full lg:w-[35%] h-full overflow-y-auto">
          <div className="space-y-5">
            {/* Title & location */}
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">{project.title}</h2>
              {location && (
                <p className="mt-1.5 text-sm font-semibold text-muted-foreground">
                  {location}
                  {project.tags.length > 0 && (
                    <>
                      <span className="mx-1.5">·</span>
                      <span>{project.tags[0]}</span>
                    </>
                  )}
                </p>
              )}
            </div>

            {/* Studio card */}
            <div className="rounded-xl bg-muted/70 p-4">
              <div className="flex items-center gap-3">
                <div className="grid size-11 place-items-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                  {project.studio.charAt(0)}
                </div>
                <div className="flex-1">
                  <p className="relative inline-flex items-center text-sm font-semibold">
                    {project.studio}
                    <BadgeCheck
                      className="-mt-1 ml-0.5 size-4 fill-primary text-primary"
                      aria-label="Verified"
                    />
                  </p>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span aria-hidden className="text-primary font-bold">
                      <Star className="size-3 fill-primary" />
                    </span>
                    <span className="font-medium">{project.rating.toFixed(1)}</span>
                    <span>·</span>
                    <span>56 homes</span>
                    <span>·</span>
                    <span>12+ yrs</span>
                  </div>
                </div>
              </div>

              {/* Buttons row */}
              <div className="mt-4 flex items-center gap-3">
                <EnquiryCta
                  context={{ type: 'project', projectName: project.title, designerName: project.studio, designerLocation: location }}
                  designerProfileId={designerProfileId ?? ''}
                  loginHref={`/login?next=/projects/${project.id}`}
                  variant="inverted"
                  className="h-9 flex-[7]"
                >
                  <MessageSquare aria-hidden />
                  Enquire
                </EnquiryCta>
                <button
                  type="button"
                  className="flex h-10 flex-[3] items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-accent"
                >
                  <UserRound className="size-4" aria-hidden />
                  View profile
                </button>
              </div>
            </div>

            {/* Bookmark & Share row */}
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

            {/* Stats & Report row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4 text-sm text-foreground">
                <span className="flex items-center gap-1.5">
                  <Eye className="size-4" aria-hidden />
                  1.7k
                </span>
                <span className="flex items-center gap-1.5">
                  <Bookmark className="size-4" aria-hidden />
                  145
                </span>
              </div>
              <button
                type="button"
                onClick={() => setReported(true)}
                aria-pressed={reported}
                className={`flex items-center gap-1.5 text-sm transition-colors hover:text-red-500 ${
                  reported ? 'text-red-500' : 'text-muted-foreground'
                }`}
                aria-label="Report"
              >
                <Flag className={reported ? 'size-4 fill-current' : 'size-4'} aria-hidden />
                Report
              </button>
            </div>

            {/* Description placeholder */}
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                About this project
              </p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                A beautifully designed space that blends functionality with aesthetics. More details
                coming soon.
              </p>
            </div>

            {/* Visit portfolio button */}
            <Link
              href="/"
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-medium text-primary-foreground shadow-md transition-colors hover:bg-primary/90"
            >
              Visit full project
              <ChevronRight className="size-4" aria-hidden />
            </Link>
          </div>
        </aside>
      </div>

      {/* Thumbnail strip — full width below */}
      {displayGallery.length > 1 && (
        <div className="mt-6 flex gap-3 overflow-x-auto pb-2 scrollbar-none p-1">
          {displayGallery.map((image, index) => (
            <button
              key={`${image.id}-${index}`}
              type="button"
              onClick={() => setActiveImageIndex(index)}
              className={`relative shrink-0 overflow-hidden rounded-2xl transition-all ${
                index === activeImageIndex
                  ? 'ring-2 ring-primary ring-offset-2'
                  : 'opacity-80 hover:opacity-100'
              }`}
              aria-label={image.roomName ?? `Image ${index + 1}`}
            >
              <img
                src={image.url}
                alt={image.roomName ?? `${project.title} — ${index + 1}`}
                className="h-28 w-40 object-cover select-none"
                draggable={false}
                onContextMenu={(e) => e.preventDefault()}
                onDragStart={(e) => e.preventDefault()}
              />
              <span className="absolute left-2 top-2 rounded-md bg-foreground/80 px-2 py-0.5 text-xs font-semibold text-white">
                {String(index + 1).padStart(2, '0')}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* More like this */}
      {moreProjects.length > 0 && (
        <section className="mt-16">
          <h2 className="font-display text-2xl tracking-tight">More like this</h2>
          <div className="mt-6 columns-2 gap-4 md:columns-3 lg:columns-4 xl:columns-5">
            {moreProjects.map((p) => (
              <ShowcaseCard key={p.id} project={p} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
