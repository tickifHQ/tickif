import Link from 'next/link';
import type { PublicProjectDetailResponse } from '@repo/contracts';
import { Avatar, AvatarFallback, AvatarImage } from '@repo/ui/components/avatar';
import { Button } from '@repo/ui/components/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@repo/ui/components/card';
import { Separator } from '@repo/ui/components/separator';
import { cn } from '@repo/ui/lib/utils';
import {
  ArrowLeft,
  BadgeCheck,
  CalendarDays,
  MessageSquare,
  Shield,
  Star,
  UserRound,
} from 'lucide-react';
import { TickifBrandIcon } from '@/components/brand-icons';
import { EnquiryCta } from '@/components/enquiry-cta';
import { ProjectActions } from '@/components/project-actions';
import { ProjectHeroCarousel } from '@/components/project-hero-carousel';
import { PublicProjectRecommendations } from '@/components/public-project-recommendations';
import { PublicProjectStory } from '@/components/public-project-story';
import { formatCompactBudgetLabel } from '@/lib/format-budget-label';

type Specification = {
  key: string;
  label: string;
  value: string;
  secondaryValue?: string;
  wide?: boolean;
};

function formatCompletedMonth(value: string | null): string | null {
  if (!value) return null;
  const [year, month] = value.split('-').map(Number);
  if (!year || !month || month < 1 || month > 12) return null;

  return new Intl.DateTimeFormat('en-IN', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function designerInitials(displayName: string): string {
  return displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

function projectSpecifications(project: PublicProjectDetailResponse): Specification[] {
  const place = [project.specifications.locality?.label, project.specifications.city?.label]
    .filter(Boolean)
    .join(', ');
  const completed = formatCompletedMonth(project.completedMonth);
  const property = project.specifications.propertySubtype ?? project.specifications.propertyType;
  const propertyValue = project.buildingName ?? property?.label;
  const locationValue = project.buildingName ?? place;

  const specifications: Array<Specification | null> = [
    propertyValue
      ? {
          key: 'property',
          label: project.buildingName && property ? property.label : 'Property',
          value: propertyValue,
        }
      : null,
    project.specifications.bhk
      ? { key: 'bhk', label: 'BHK', value: project.specifications.bhk.label }
      : null,
    locationValue
      ? {
          key: 'location',
          label: 'Location',
          value: locationValue,
          secondaryValue: project.buildingName && place ? place : undefined,
          wide: true,
        }
      : null,
    project.specifications.budgetBand
      ? {
          key: 'budget',
          label: 'Project budget',
          value: formatCompactBudgetLabel(project.specifications.budgetBand.label),
        }
      : null,
    project.sizeSqft
      ? {
          key: 'size',
          label: 'Size (sq.ft)',
          value: new Intl.NumberFormat('en-IN').format(project.sizeSqft),
        }
      : null,
    project.specifications.scope
      ? { key: 'scope', label: 'Scope', value: project.specifications.scope.label }
      : null,
    completed ? { key: 'completed', label: 'Completed', value: completed } : null,
  ];

  return specifications.filter((item): item is Specification => item !== null);
}

function DesignerCard({ project }: { project: PublicProjectDetailResponse }) {
  const { designer } = project;
  const loginHref = `/login?next=/projects/${project.id}`;
  const profileHref = designer.slug ? `/d/${designer.slug}` : null;
  const rating = Number.parseFloat(designer.avgRating);
  const showRating = Number.isFinite(rating) && designer.reviewCount > 0;
  const showExperience = designer.foundedYear !== null || designer.yearsExperience > 0;

  return (
    <div className="flex flex-col gap-5 lg:pt-9">
      <Card variant="accent" radius="2xl" className="p-2">
        <Card radius="lg" className="overflow-hidden shadow-none">
          <CardHeader className="flex-row items-start gap-3 p-5 pb-0">
            <Avatar className="size-17 rounded-xl border-2 border-background shadow-md">
              {designer.logoUrl ? (
                <AvatarImage src={designer.logoUrl} alt={`${designer.displayName} logo`} />
              ) : null}
              <AvatarFallback className="rounded-xl">
                {designerInitials(designer.displayName) || 'T'}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 pt-0.5">
              <p className="font-mono text-2xs uppercase tracking-widest text-muted-foreground">
                {designer.firmType ??
                  (designer.entityType === 'company'
                    ? 'Interior design firm'
                    : 'Interior designer')}
              </p>
              <CardTitle className="mt-1 flex items-center gap-1 text-base leading-relaxed">
                <span className="truncate">{designer.displayName}</span>
                {designer.isVerified ? (
                  <BadgeCheck
                    aria-label="Verified designer"
                    className="size-4 shrink-0 fill-primary text-primary-foreground"
                  />
                ) : null}
              </CardTitle>
              {designer.isVerified ? (
                <p className="mt-0.5 flex items-center gap-1 font-mono text-2xs uppercase tracking-wider text-foreground">
                  <Shield aria-hidden className="size-2.5" />
                  KYC verified
                </p>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 px-5 pb-5 pt-5 text-xs font-medium leading-relaxed">
            {showExperience ? (
              <p className="flex items-center gap-1.5">
                <CalendarDays aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
                <span>
                  {designer.foundedYear ? (
                    <span className="text-foreground">Founded {designer.foundedYear}</span>
                  ) : null}
                  {designer.foundedYear && designer.yearsExperience > 0 ? ' ' : null}
                  {designer.yearsExperience > 0 ? (
                    <span className="text-foreground-disabled">
                      ({designer.yearsExperience}{' '}
                      {designer.yearsExperience === 1 ? 'year' : 'years'} of experience)
                    </span>
                  ) : null}
                </span>
              </p>
            ) : null}
            <p className="flex items-center gap-1.5">
              <TickifBrandIcon aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
              <span>
                <span className="text-foreground">
                  {designer.projectCount} {designer.projectCount === 1 ? 'Project' : 'Projects'}
                </span>{' '}
                <span className="text-foreground-disabled">published</span>
              </span>
            </p>
            {showRating ? (
              <p className="flex items-center gap-1.5">
                <Star aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
                <span>
                  <span className="text-foreground">{rating.toFixed(1)}</span>{' '}
                  <span className="text-foreground-disabled">
                    ({designer.reviewCount} {designer.reviewCount === 1 ? 'review' : 'reviews'})
                  </span>
                </span>
              </p>
            ) : null}
          </CardContent>
          <Separator />
          <div className="flex h-9 items-center justify-between px-5 text-2xs uppercase tracking-wider text-muted-foreground">
            <TickifBrandIcon aria-hidden className="size-4 text-primary" />
            {showRating ? (
              <span>
                {rating.toFixed(1)} ★ · {designer.reviewCount}
              </span>
            ) : null}
          </div>
        </Card>
        <CardFooter className="gap-2 p-0 pt-2">
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
            loginHref={loginHref}
            variant="inverted"
            size="compact"
            className="flex-1"
            ariaLabel={`Enquire about ${project.title}`}
          >
            <MessageSquare aria-hidden data-icon="inline-start" />
            Enquire
          </EnquiryCta>
          {profileHref ? (
            <Button asChild variant="neutral" size="compact" className="shrink-0">
              <Link href={profileHref}>
                <UserRound aria-hidden data-icon="inline-start" />
                View profile
              </Link>
            </Button>
          ) : null}
        </CardFooter>
      </Card>
      <Separator />
      <ProjectActions projectId={project.id} loginHref={loginHref} saveCount={project.saveCount} />
    </div>
  );
}

export function PublicProjectOverview({ project }: { project: PublicProjectDetailResponse }) {
  const specifications = projectSpecifications(project);
  const location = [project.specifications.locality?.label, project.specifications.city?.label]
    .filter(Boolean)
    .join(', ');
  const hasRecommendations = Object.values(project.recommendations).some(
    (recommendations) => recommendations.length > 0,
  );

  return (
    <article className={cn(hasRecommendations ? 'pb-0' : 'pb-24')}>
      <div className="mx-auto w-full max-w-[1512px] px-4 sm:px-6 lg:px-8">
        <nav aria-label="Breadcrumb" className="flex h-14 items-center gap-1.5 text-xs font-medium">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-md text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft aria-hidden className="size-3.5" />
            Back
          </Link>
          <span aria-hidden className="text-muted-foreground/50">
            /
          </span>
          <span className="truncate text-foreground">{project.title}</span>
        </nav>

        <ProjectHeroCarousel images={project.images} projectTitle={project.title} />

        <div
          className={cn(
            'grid gap-10 lg:grid-cols-[minmax(0,2.2fr)_minmax(20rem,1fr)] lg:gap-16',
            hasRecommendations ? 'pt-12' : 'py-12',
          )}
        >
          <div className="min-w-0">
            <header className="flex flex-col gap-2">
              <h1 className="font-display text-3xl tracking-tight sm:text-4xl">{project.title}</h1>
              {location || project.buildingName ? (
                <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-muted-foreground">
                  {location ? <span>{location}</span> : null}
                  {location && project.buildingName ? <span aria-hidden>·</span> : null}
                  {project.buildingName ? <span>{project.buildingName}</span> : null}
                </p>
              ) : null}
            </header>

            {specifications.length > 0 ? (
              <dl
                aria-label="Project specifications"
                className="mt-6 overflow-hidden rounded-xl border border-border-strong"
              >
                <div className="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-4">
                  {specifications.map((specification) => (
                    <div
                      key={specification.key}
                      className={cn('bg-muted px-4 py-3', specification.wide && 'sm:col-span-2')}
                    >
                      <dt className="font-mono text-xs uppercase leading-tight tracking-wider text-foreground-disabled">
                        {specification.label}
                      </dt>
                      <dd className="mt-1 text-base font-medium leading-relaxed text-foreground">
                        {specification.value}
                        {specification.secondaryValue ? (
                          <>
                            <span aria-hidden>, </span>
                            <span className="text-foreground-disabled">
                              {specification.secondaryValue}
                            </span>
                          </>
                        ) : null}
                      </dd>
                    </div>
                  ))}
                </div>
              </dl>
            ) : null}

            {project.description ? (
              <section aria-labelledby="about-project-heading" className="mt-10">
                <h2
                  id="about-project-heading"
                  className="font-mono text-sm uppercase tracking-wider text-muted-foreground"
                >
                  About this project
                </h2>
                <div className="mt-3 whitespace-pre-line text-base leading-relaxed text-muted-foreground">
                  {project.description}
                </div>
              </section>
            ) : null}
          </div>

          <aside aria-label={`${project.designer.displayName} project designer`}>
            <DesignerCard project={project} />
          </aside>
        </div>

        <PublicProjectStory project={project} />

        {hasRecommendations ? <PublicProjectRecommendations project={project} /> : null}
      </div>
    </article>
  );
}
