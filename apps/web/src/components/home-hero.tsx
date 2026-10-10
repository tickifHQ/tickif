import Link from 'next/link';
import type { FeedProject } from '@repo/contracts';
import { HomeSearchBar } from '@/components/home-search-bar';
import type { FeedFacetOption } from '@/components/feed-filters';
import { formatCompactBudgetLabel } from '@/lib/format-budget-label';
import { ProjectActions } from '@/components/project-actions';
import { DesignerLogoAvatar } from '@/components/designer-logo-avatar';
import type { LandingCommunity } from '@/lib/landing-community';
import { LandingProjectPreviewData } from '@/components/landing-project-preview';

export type HomeShortcut = { href: string; label: string; image?: string };

/** Editorial artwork is from Figma; project photography and statistics are live. */
export function HomeHero({
  shortcuts,
  projects = [],
  cities = [],
  initialQuery = '',
  community,
}: {
  shortcuts: HomeShortcut[];
  projects?: FeedProject[];
  cities?: FeedFacetOption[];
  initialQuery?: string;
  community?: LandingCommunity | null;
}) {
  const photos = projects.filter((project) => project.coverImageUrl).slice(0, 3);
  return (
    <section className="px-5 pt-9 sm:px-8 lg:px-12" aria-labelledby="home-heading">
      <LandingProjectPreviewData projects={projects} />
      <div className="flex flex-col items-center text-center">
        <p className="landing-enter flex items-center gap-2 rounded-full bg-secondary px-3.5 py-1.5 font-mono text-[10px] uppercase tracking-wider text-secondary-foreground">
          <span className="size-[7px] rounded-full bg-primary" aria-hidden />
          Architecture · Construction · Interior.
        </p>
        <h1
          id="home-heading"
          className="landing-enter mt-6 font-display text-[clamp(2.5rem,5.82vw,5.5rem)] font-medium leading-[1.09] tracking-[-0.045em] [animation-delay:80ms]"
        >
          <span className="flex flex-wrap items-center justify-center gap-x-3 sm:gap-x-5">
            <span>Inspire from </span>
            <span
              className="relative inline-block h-[1em] w-[1.95em] shrink-0 rotate-4 overflow-hidden rounded-full shadow-sm"
              aria-hidden
            >
              <img
                src="/images/landing/headline-room.jpg"
                alt=""
                width={172}
                height={88}
                fetchPriority="high"
                className="absolute inset-0 size-full object-cover"
              />
              <img
                src="/images/landing/headline-dining.jpg"
                alt=""
                width={172}
                height={88}
                fetchPriority="high"
                className="absolute inset-0 size-full object-cover"
              />
            </span>
            <span> real homes</span>
          </span>
          <span className="block">
            you’ll{' '}
            <span className="relative isolate whitespace-nowrap before:absolute before:inset-x-0 before:bottom-1 before:-z-10 before:h-[0.42em] before:-rotate-2 before:rounded-lg before:bg-primary-soft/60">
              love<span className="text-home-heading-accent">.</span>
            </span>
          </span>
        </h1>
        <p className="landing-enter mt-6 max-w-[620px] text-base leading-7 text-muted-foreground sm:text-lg [animation-delay:160ms]">
          Real interiors from Indian designers. Explore their spaces, their budgets and the people
          who made them.
        </p>
        <div className="landing-enter mt-9 w-full max-w-[760px] [animation-delay:220ms]">
          <HomeSearchBar variant="hero" initialQuery={initialQuery} cities={cities} />
        </div>
        {shortcuts.length > 0 ? (
          <div className="landing-enter mt-4 flex max-w-full flex-wrap items-center justify-center gap-2 [animation-delay:280ms]">
            <span className="mr-1 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
              Try
            </span>
            {shortcuts.slice(0, 4).map((shortcut) => (
              <Link
                key={shortcut.href}
                href={shortcut.href}
                className="landing-lift inline-flex min-h-9 items-center gap-2 rounded-full border border-border bg-card py-1 pl-1 pr-3.5 text-sm font-medium hover:bg-accent"
              >
                {shortcut.image ? (
                  <img
                    src={shortcut.image}
                    alt=""
                    width={26}
                    height={26}
                    className="size-[26px] rounded-full object-cover"
                  />
                ) : null}
                {shortcut.label}
              </Link>
            ))}
          </div>
        ) : null}
      </div>
      {photos.length > 0 ? (
        <div
          className={`mt-14 grid items-end gap-4 sm:grid-cols-2 ${photos.length === 3 ? 'lg:grid-cols-[1.55fr_1fr_1.38fr_1fr_.9fr]' : photos.length === 2 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}
        >
          <HeroProject project={photos[0]!} stamp />
          <div className="landing-enter relative flex h-[272px] flex-col justify-between overflow-hidden rounded-card bg-primary p-[22px] text-primary-foreground [animation-delay:340ms]">
            <img
              src="/images/landing/stat-ellipse.svg"
              alt=""
              className="pointer-events-none absolute -top-[120px] left-10"
            />
            <span className="relative grid size-11 place-items-center rounded-full bg-card">
              <img src="/images/landing/badge-check.svg" alt="" />
            </span>
            <div className="relative">
              <p className="font-display text-[44px] leading-[48px] tracking-tight">
                {community?.projectCount != null
                  ? community.projectCount.toLocaleString('en-IN')
                  : 'Real spaces.'}
              </p>
              <p className="mt-1.5 text-sm leading-[21px]">
                {community?.projectCount != null
                  ? 'Published projects, with budgets shared by their designers.'
                  : 'Explore projects and the budgets behind them.'}
              </p>
            </div>
          </div>
          {photos[1] ? <HeroProject project={photos[1]} /> : null}
          <Link
            href="/designers"
            className="landing-enter landing-lift flex h-[272px] flex-col justify-between rounded-card bg-secondary p-[22px] text-secondary-foreground hover:bg-accent [animation-delay:460ms]"
          >
            {community?.designers?.hits.length ? (
              <span className="flex -space-x-3">
                {community.designers.hits.map((designer) => (
                  <DesignerLogoAvatar
                    key={designer.id}
                    logoUrl={designer.logoUrl}
                    alt={designer.displayName}
                    sizePx={40}
                    className="size-10 border-[3px] border-secondary bg-card text-xs font-medium"
                    fallback={designer.displayName.slice(0, 2).toUpperCase()}
                  />
                ))}
              </span>
            ) : (
              <span className="font-mono text-[10px] uppercase tracking-wider">
                The people behind the spaces
              </span>
            )}
            <div>
              <p className="font-display text-[44px] leading-[48px] tracking-tight">
                {community?.designers
                  ? community.designers.estimatedTotalHits.toLocaleString('en-IN')
                  : 'Meet your designer.'}
              </p>
              {community?.designers ? (
                <p className="mt-1.5 text-sm leading-[21px]">
                  {community.designers.estimatedTotalHits === 1
                    ? 'A designer to bring'
                    : 'Designers to bring'}
                  <br />
                  your next home to life.
                </p>
              ) : null}
              <span className="mt-3 flex items-center gap-2 text-[13px]">
                Discover them{' '}
                <img
                  src="/images/landing/arrow-right.svg"
                  alt=""
                  className="dark:brightness-0 dark:invert"
                />
              </span>
            </div>
          </Link>
          {photos[2] ? (
            <HeroProject project={photos[2]} className="sm:col-span-2 lg:col-span-1" />
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function HeroProject({
  project,
  className = '',
  stamp = false,
}: {
  project: FeedProject;
  className?: string;
  stamp?: boolean;
}) {
  const href = project.coverImageId ? `/image/${project.coverImageId}` : `/projects/${project.id}`;
  return (
    <div className={`landing-enter group relative [animation-delay:300ms] ${className}`}>
      <Link href={href} className="relative block h-[300px] overflow-hidden rounded-card bg-muted">
        <img
          src={project.coverImageUrl!}
          alt={project.title}
          width={360}
          height={300}
          className="landing-photo h-full w-full object-cover"
        />
        <div className="absolute bottom-3 left-3.5 right-3.5 w-fit max-w-[calc(100%-1.75rem)] rounded-lg bg-card/95 px-3 py-2.5 shadow-sm">
          <p className="truncate text-sm font-medium">{project.title}</p>
          <p className="mt-1 truncate font-mono text-[10px] uppercase tracking-wider text-primary">
            {[
              project.locality ?? project.city,
              project.budget ? formatCompactBudgetLabel(project.budget) : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
      </Link>
      {stamp ? (
        <span className="landing-stamp pointer-events-none absolute -top-3 left-[22px] inline-flex rotate-5 items-center gap-1.5 rounded-lg bg-primary-soft py-[7px] pl-2.5 pr-3 font-mono text-[10px] uppercase tracking-wider text-primary-soft-foreground shadow-sm">
          <img src="/images/landing/stamp-check.svg" alt="" />
          Reviewed by Tickif
        </span>
      ) : null}
      <div className="absolute right-3.5 top-3.5">
        <ProjectActions
          projectId={project.id}
          loginHref={`/login?callbackURL=${encodeURIComponent(href)}`}
          canonicalUrl={href}
          presentation="save"
        />
      </div>
    </div>
  );
}
