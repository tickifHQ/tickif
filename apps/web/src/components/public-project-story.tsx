import Link from 'next/link';
import type {
  PublicProjectDetailResponse,
  PublicProjectGalleryImage,
  PublicProjectMotif,
} from '@repo/contracts';
import { Avatar, AvatarFallback, AvatarImage } from '@repo/ui/components/avatar';
import { Card } from '@repo/ui/components/card';
import { Separator } from '@repo/ui/components/separator';
import {
  BadgeCheck,
  CalendarDays,
  FolderKanban,
  MessageSquare,
  Quote,
  Shield,
  Star,
} from 'lucide-react';
import { TickifBrandIcon } from '@/components/brand-icons';
import { EnquiryCta } from '@/components/enquiry-cta';
import { ProjectRoomNavigation } from '@/components/project-room-navigation';
import { feedPageHref } from '@/lib/feed-params';

function initials(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

function uniqueFinishes(images: PublicProjectGalleryImage[]) {
  const values = new Map<string, { slug: string; label: string }>();
  for (const image of images) {
    for (const value of [...image.materials, ...image.finishes]) {
      values.set(value.slug, value);
    }
  }
  return [...values.values()];
}

function motifValues(image: PublicProjectGalleryImage, motif: PublicProjectMotif) {
  switch (motif.kind) {
    case 'theme':
      return image.themes;
    case 'material':
      return image.materials;
    case 'finish':
      return image.finishes;
    case 'tag':
      return image.tags;
  }
}

function motifImage(
  images: PublicProjectGalleryImage[],
  motif: PublicProjectMotif,
): PublicProjectGalleryImage | null {
  return (
    images.find((image) => motifValues(image, motif).some((value) => value.slug === motif.slug)) ??
    null
  );
}

function RoomSections({ project }: { project: PublicProjectDetailResponse }) {
  const rooms = project.rooms
    .map((room) => ({
      room,
      images: project.images.filter((image) => image.roomId === room.id),
    }))
    .filter(({ images }) => images.length > 0);

  if (rooms.length === 0) return null;

  return (
    <section aria-label="Room-by-room project gallery" className="border-t pt-12">
      <ProjectRoomNavigation
        rooms={rooms.map(({ room, images }) => ({
          id: room.id,
          name: room.name,
          photoCount: images.length,
        }))}
      />

      <div className="mt-12 flex flex-col gap-12">
        {rooms.map(({ room, images }) => {
          const finishes = uniqueFinishes(images);
          const headingId = `project-room-${room.id}`;

          return (
            <section key={room.id} aria-labelledby={headingId} className="scroll-mt-6">
              <header className="flex items-baseline justify-between gap-4">
                <h2
                  id={headingId}
                  className="font-mono text-base uppercase tracking-tight text-foreground"
                >
                  {room.name}
                </h2>
                <p className="text-sm font-medium text-foreground-disabled">
                  {images.length} {images.length === 1 ? 'photo' : 'photos'}
                </p>
              </header>

              <div className="mt-3 flex gap-4 overflow-x-auto rounded-sm pb-2">
                {images.map((image) => (
                  <Link
                    key={image.id}
                    href={`/image/${image.id}`}
                    aria-label={`Open ${room.name} image`}
                    className="group relative h-106 w-72 shrink-0 overflow-hidden rounded-sm bg-muted sm:w-88"
                  >
                    <img
                      src={image.url}
                      alt={`${room.name} in ${project.title}`}
                      className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.02] motion-reduce:transition-none"
                    />
                  </Link>
                ))}
              </div>

              {finishes.length > 0 ? (
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-2">
                  <p className="font-mono text-xs uppercase text-muted-foreground">
                    Material &amp; Finish
                  </p>
                  <ul
                    className="flex flex-wrap gap-1.5"
                    aria-label={`${room.name} materials and finishes`}
                  >
                    {finishes.map((finish) => (
                      <li
                        key={finish.slug}
                        className="rounded-full bg-muted px-2.5 py-1 text-2xs leading-relaxed text-muted-foreground"
                      >
                        {finish.label}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    </section>
  );
}

function NarrativeDesignerCard({ project }: { project: PublicProjectDetailResponse }) {
  const { designer } = project;
  const rating = Number.parseFloat(designer.avgRating);
  const showRating = Number.isFinite(rating) && designer.reviewCount > 0;

  return (
    <Card className="mx-auto w-full max-w-72 -rotate-2 overflow-hidden shadow-sm" radius="lg">
      <div className="p-5">
        <div className="flex items-start gap-3">
          <Avatar className="size-17 rounded-xl border-2 border-background shadow-md">
            {designer.logoUrl ? (
              <AvatarImage src={designer.logoUrl} alt={`${designer.displayName} logo`} />
            ) : null}
            <AvatarFallback className="rounded-xl">
              {initials(designer.displayName) || 'T'}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 pt-0.5">
            <p className="font-mono text-2xs uppercase tracking-widest text-muted-foreground">
              {designer.firmType ??
                (designer.entityType === 'company' ? 'Interior design firm' : 'Interior designer')}
            </p>
            <p className="mt-1 flex items-center gap-1 text-base font-medium leading-relaxed">
              <span className="truncate">{designer.displayName}</span>
              {designer.isVerified ? (
                <BadgeCheck
                  aria-label="Verified designer"
                  className="size-4 shrink-0 fill-primary text-primary-foreground"
                />
              ) : null}
            </p>
            {designer.isVerified ? (
              <p className="mt-0.5 flex items-center gap-1 font-mono text-2xs uppercase tracking-wider">
                <Shield aria-hidden className="size-2.5" />
                KYC verified
              </p>
            ) : null}
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-2 text-xs font-medium leading-relaxed">
          <p className="flex items-center gap-1.5">
            <FolderKanban aria-hidden className="size-3.5 text-muted-foreground" />
            <span>{designer.projectCount} Projects</span>
            <span className="text-foreground-disabled">published</span>
          </p>
          {designer.foundedYear || designer.yearsExperience > 0 ? (
            <p className="flex items-center gap-1.5">
              <CalendarDays aria-hidden className="size-3.5 text-muted-foreground" />
              {designer.foundedYear ? <span>{designer.foundedYear}</span> : null}
              {designer.yearsExperience > 0 ? (
                <span className="text-foreground-disabled">
                  ({designer.yearsExperience} {designer.yearsExperience === 1 ? 'Year' : 'Years'} of
                  Experience)
                </span>
              ) : null}
            </p>
          ) : null}
          {showRating ? (
            <p className="flex items-center gap-1.5">
              <Star aria-hidden className="size-3.5 text-muted-foreground" />
              <span>{rating.toFixed(1)}</span>
              <span className="text-foreground-disabled">
                ({designer.reviewCount} {designer.reviewCount === 1 ? 'review' : 'reviews'})
              </span>
            </p>
          ) : null}
        </div>

        <EnquiryCta
          context={{
            type: 'project',
            projectName: project.title,
            designerName: designer.displayName,
            designerLocation: designer.footprintCities[0]?.label ?? null,
            designerLogoUrl: designer.logoUrl,
          }}
          designerProfileId={designer.id}
          referredProjectId={project.id}
          loginHref={`/login?next=/projects/${project.id}`}
          variant="inverted"
          size="compact"
          className="mt-5 w-full"
          ariaLabel={`Enquire about ${project.title}`}
        >
          <MessageSquare aria-hidden data-icon="inline-start" />
          Enquire
        </EnquiryCta>
      </div>

      <Separator />
      <div className="flex h-9 items-center justify-between px-5 font-mono text-2xs uppercase tracking-wider text-muted-foreground">
        <TickifBrandIcon aria-hidden className="size-4 text-primary" />
        {showRating ? (
          <span>
            {rating.toFixed(1)} ★ · {designer.reviewCount}
          </span>
        ) : null}
      </div>
    </Card>
  );
}

function NarrativeSection({ project }: { project: PublicProjectDetailResponse }) {
  const { narrative } = project;
  const context = [project.specifications.bhk?.label, project.specifications.locality?.label]
    .filter(Boolean)
    .join(' in ');
  const attribution = narrative
    ? [narrative.author.name, context].filter(Boolean).join(', ')
    : null;

  return (
    <section aria-labelledby="project-narrative-heading" className="border-t pt-12">
      <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
        Project narrative
      </p>
      <h2 id="project-narrative-heading" className="mt-2 text-4xl tracking-tight">
        their <span className="font-light text-primary italic">words</span>.
      </h2>

      <div className="relative mt-7 border bg-muted/30 px-6 py-10 sm:px-12 lg:px-16">
        <span
          className="absolute left-2 top-2 size-5 border-l border-t border-primary/20"
          aria-hidden
        />
        <span
          className="absolute right-2 top-2 size-5 border-r border-t border-primary/20"
          aria-hidden
        />
        <span
          className="absolute bottom-2 left-2 size-5 border-b border-l border-primary/20"
          aria-hidden
        />
        <span
          className="absolute bottom-2 right-2 size-5 border-b border-r border-primary/20"
          aria-hidden
        />

        <div className="grid gap-10 lg:grid-cols-12 lg:items-center">
          <div className="lg:col-span-8">
            <Quote aria-hidden className="size-10 rotate-180 fill-primary text-primary" />
            {narrative ? (
              <>
                <blockquote className="mt-5 max-w-2xl text-2xl leading-snug sm:text-3xl">
                  {narrative.body}
                </blockquote>
                <footer className="mt-7 flex items-center gap-3">
                  <Avatar className="size-11">
                    {narrative.author.avatarUrl ? (
                      <AvatarImage src={narrative.author.avatarUrl} alt="" />
                    ) : null}
                    <AvatarFallback className="bg-primary text-sm font-semibold text-primary-foreground">
                      {initials(narrative.author.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="flex items-center gap-1 text-sm font-medium">
                      {attribution}
                      {narrative.verifiedConsultation ? (
                        <BadgeCheck
                          aria-label="Verified consultation"
                          className="size-4 fill-primary text-primary-foreground"
                        />
                      ) : null}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      From a homeowner · {project.designer.displayName}
                    </p>
                  </div>
                </footer>
              </>
            ) : (
              <p className="mt-5 max-w-2xl text-xl leading-relaxed text-muted-foreground sm:text-2xl">
                No homeowner narrative has been published for this project yet.
              </p>
            )}
          </div>

          <div className="lg:col-span-4 lg:-my-16 lg:-translate-y-8 lg:justify-self-end">
            <NarrativeDesignerCard project={project} />
          </div>
        </div>
      </div>
    </section>
  );
}

function RecurringMotifsSection({ project }: { project: PublicProjectDetailResponse }) {
  if (project.recurringMotifs.length === 0) return null;

  return (
    <section aria-labelledby="recurring-motifs-heading" className="border-t pt-12">
      <div className="grid gap-8 lg:grid-cols-[22.5rem_minmax(0,1fr)] lg:gap-16">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            The DNA
          </p>
          <h2 id="recurring-motifs-heading" className="mt-1 text-4xl tracking-tight">
            Recurring <span className="font-light text-primary italic">notes</span>.
          </h2>
          <p className="mt-1 max-w-sm text-xs font-medium leading-relaxed text-muted-foreground">
            Tap a material or texture to find other homes that share the same instinct.
          </p>
        </div>

        <ul className="flex flex-wrap content-start gap-2.5">
          {project.recurringMotifs.map((motif) => {
            const image = motifImage(project.images, motif);
            const href =
              motif.kind === 'theme'
                ? feedPageHref({ theme: motif.slug }, 1)
                : feedPageHref({ q: motif.label }, 1);

            return (
              <li key={`${motif.kind}:${motif.slug}`}>
                <Link
                  href={href}
                  className="flex min-h-14 items-center gap-3 rounded-full border bg-background py-2 pl-2 pr-6 transition-colors hover:bg-muted"
                >
                  <span className="size-9 shrink-0 overflow-hidden rounded-full bg-muted">
                    {image ? (
                      <img src={image.url} alt="" className="size-full object-cover" />
                    ) : null}
                  </span>
                  <span className="pr-1">
                    <span className="block text-sm font-medium leading-relaxed">{motif.label}</span>
                    <span className="block text-2xs leading-relaxed text-muted-foreground">
                      {motif.projectCount} {motif.projectCount === 1 ? 'home' : 'homes'}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

export function PublicProjectStory({ project }: { project: PublicProjectDetailResponse }) {
  const hasRooms = project.rooms.some((room) =>
    project.images.some((image) => image.roomId === room.id),
  );
  const hasMotifs = project.recurringMotifs.length > 0;

  if (!hasRooms && !project.narrative && !hasMotifs) return null;

  return (
    <div className="mt-14 flex flex-col gap-14">
      {hasRooms ? <RoomSections project={project} /> : null}
      <NarrativeSection project={project} />
      {hasMotifs ? <RecurringMotifsSection project={project} /> : null}
    </div>
  );
}
