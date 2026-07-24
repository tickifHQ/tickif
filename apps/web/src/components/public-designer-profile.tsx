import Image from 'next/image';
import type { ReactNode } from 'react';
import {
  ArrowDown,
  BadgeCheck,
  Bookmark,
  CalendarDays,
  Check,
  Facebook,
  FolderKanban,
  Globe,
  Link2,
  MessageCircle,
  MessageSquare,
  Quote,
  Shield,
  ShieldCheck,
  SlidersHorizontal,
  Sparkle,
  Star,
} from 'lucide-react';
import { Badge } from '@repo/ui/components/badge';
import { Button } from '@repo/ui/components/button';
import { Card } from '@repo/ui/components/card';
import { Rating } from '@repo/ui/components/reui/rating';
import { CopyLinkButton } from '@/components/copy-link-button';
import { GoogleBrandIcon, InstagramBrandIcon, LinkedInBrandIcon } from '@/components/brand-icons';
import { TrustStrip, type TrustStripItem } from '@/components/trust-strip';
import { env } from '@/env';
import { PublicProjectCard } from '@/components/public-project-card';
import type {
  PublicDesignerProfileViewModel,
  PublicDesignerReview,
} from '@/lib/public-designer-profile-fixture';

const credentials = [
  {
    label: 'Identity verified',
    imageSrc: '/illustrations/badges/verified.svg',
  },
  {
    label: 'New on Tickif',
    imageSrc: '/illustrations/badges/new.svg',
  },
  {
    label: 'Top performer',
    imageSrc: '/illustrations/badges/top-performer.svg',
  },
  {
    label: 'Established studio',
    imageSrc: '/illustrations/badges/established.svg',
  },
  {
    label: 'Projects published',
    imageSrc: '/illustrations/badges/projects-published.svg',
  },
];

const projectSortOptions = ['Featured', 'Newest', 'Most viewed', 'Top rated', 'Largest'];

const profileTrustItems = [
  { icon: Check, label: '12,400+ verified projects' },
  { icon: Shield, label: 'Every designer phone-verified' },
  { icon: Sparkle, label: 'Free to browse · No middlemen' },
] satisfies TrustStripItem[];

function DisabledAction({
  children,
  className,
  variant = 'default',
  ariaLabel,
}: {
  children: ReactNode;
  className?: string;
  variant?: 'default' | 'emphasis' | 'outline' | 'secondary' | 'ghost';
  ariaLabel?: string;
}) {
  return (
    <Button
      type="button"
      variant={variant}
      className={className}
      disabled
      title="Available when the profile is connected to live services"
      aria-label={ariaLabel}
    >
      {children}
    </Button>
  );
}

function SectionEyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="font-mono text-xs font-medium tracking-widest text-primary uppercase">
      {children}
    </p>
  );
}

function StudioBar({
  profile,
  publicProfileHref,
}: {
  profile: PublicDesignerProfileViewModel;
  publicProfileHref: string;
}) {
  return (
    <div className="border-b bg-background/95">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-2.5 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-full bg-foreground text-xs font-semibold text-background">
            AS
          </div>
          <div className="min-w-0">
            <p className="flex items-center gap-1 truncate text-sm font-medium">
              {profile.studioName}
              <BadgeCheck className="size-4 shrink-0 fill-primary text-primary-foreground" />
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {profile.studioType} · <Star className="inline size-3 fill-warning text-warning" />{' '}
              {profile.rating} · {profile.location.split(' · ')[0]}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <CopyLinkButton
            value={publicProfileHref}
            label="Share"
            icon="share"
            variant="outline"
            className="hidden h-9 rounded-full px-4 sm:inline-flex"
          />
          <DisabledAction
            variant="emphasis"
            ariaLabel="Start a conversation"
            className="h-9 rounded-full px-4 disabled:opacity-100"
          >
            <MessageCircle className="size-4" />
            <span className="hidden sm:inline">Start a conversation</span>
            <span className="sm:hidden">Start</span>
          </DisabledAction>
        </div>
      </div>
    </div>
  );
}

function HeroSection({ profile }: { profile: PublicDesignerProfileViewModel }) {
  const stats = [
    {
      value: profile.rating,
      label: 'Rating',
      detail: `${profile.reviewCount} verified reviews`,
    },
    {
      value: profile.completedProjects,
      label: 'Projects',
      detail: 'Published on Tickif',
    },
    {
      value: '2018',
      label: 'Established',
      detail: `${profile.yearsExperience}+ years experience`,
    },
    {
      value: profile.typicalBudget,
      label: 'Starting at',
      detail: 'budget',
    },
  ];

  return (
    <section className="grid border-b lg:grid-cols-12">
      <div className="flex items-center px-4 py-14 sm:px-8 lg:col-span-7 lg:px-12">
        <div className="mx-auto w-full max-w-xl">
          <div className="mb-7 flex items-start justify-between gap-4 border-b pb-7">
            <div className="flex min-w-0 items-center gap-3">
              <div className="grid size-11 shrink-0 place-items-center rounded-full bg-foreground text-sm font-semibold text-background">
                AS
              </div>
              <div className="min-w-0">
                <Badge variant="secondary" className="rounded-sm uppercase">
                  {profile.studioType}
                </Badge>
                <p className="mt-1 truncate text-xs text-muted-foreground">{profile.location}</p>
              </div>
            </div>
            <span className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full border px-3 text-xs">
              <Shield className="size-3 text-primary" />
              Verified
            </span>
          </div>

          <p className="font-mono text-xs font-medium tracking-widest uppercase">
            Portfolio on Tickif
          </p>
          <h1 className="mt-2 text-5xl leading-none tracking-tight sm:text-6xl">
            {profile.studioName}
          </h1>
          <p className="mt-2 max-w-md text-lg leading-relaxed text-muted-foreground">
            {profile.strapline}
          </p>

          <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded border bg-border p-px sm:grid-cols-4">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="flex min-h-20 flex-col justify-center bg-background px-3 py-4"
              >
                <dd className="text-2xl leading-none">{stat.value}</dd>
                <dt className="mt-2 text-xs font-medium">{stat.label}</dt>
                <p className="mt-1 text-xs leading-tight text-muted-foreground">{stat.detail}</p>
              </div>
            ))}
          </dl>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <DisabledAction variant="emphasis" className="min-w-36 disabled:opacity-100">
              <MessageSquare className="size-4" />
              Enquire
            </DisabledAction>
            <DisabledAction variant="outline" className="text-primary disabled:opacity-100">
              <Bookmark className="size-4 fill-current" />
              {profile.bookmarkCount}
            </DisabledAction>
          </div>
        </div>
      </div>

      <figure className="flex min-h-96 flex-col bg-muted lg:col-span-5 lg:min-h-full">
        <div className="relative min-h-96 flex-1">
          <Image
            src={profile.heroImageSrc}
            alt="Warm contemporary dining room by Anika Spaces"
            fill
            priority
            sizes="(min-width: 1024px) 42vw, 100vw"
            className="object-cover"
          />
        </div>
        <figcaption className="border-t bg-muted px-5 py-3 font-mono text-xs tracking-wider text-muted-foreground uppercase">
          Adyar Penthouse · Chennai
        </figcaption>
      </figure>
    </section>
  );
}

function CredentialsSection() {
  return (
    <section className="border-b bg-muted/30 px-4 py-16 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="text-center">
          <p className="font-mono text-xs font-medium tracking-widest uppercase">
            Tickif credentials
          </p>
          <h2 className="mt-3 text-4xl tracking-tight">
            <span className="font-medium">Verified</span>{' '}
            <span className="font-light text-muted-foreground">on Tickif</span>
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">Earned through real work</p>
        </div>
        <ul className="mt-12 flex flex-wrap items-center justify-center gap-10">
          {credentials.map((credential) => (
            <li key={credential.label}>
              <Image
                src={credential.imageSrc}
                alt={credential.label}
                width={160}
                height={176}
                className="h-44 w-40"
              />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function PortfolioSection({ profile }: { profile: PublicDesignerProfileViewModel }) {
  const projects = profile.projects;

  return (
    <section className="px-4 pt-12 pb-12 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-8 border-b pb-7 lg:grid-cols-2">
          <div>
            <p className="font-mono text-xs font-medium tracking-widest text-muted-foreground uppercase">
              Portfolio
            </p>
            <h2 className="mt-2 text-4xl tracking-tight">
              Selected <span className="font-light text-primary italic">projects</span>.
            </h2>
          </div>
          <div className="max-w-md lg:justify-self-end">
            <p className="text-sm font-medium">
              {profile.completedProjects}{' '}
              <span className="font-normal text-muted-foreground">published</span>
            </p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Anika Spaces is a boutique residential design studio led by Anika Subramanian.
            </p>
          </div>
        </div>

        <div className="mt-9 flex flex-wrap items-center justify-between gap-3 border-b py-3">
          <p className="text-sm font-medium">
            {projects.length}{' '}
            <span className="font-normal text-muted-foreground">of {projects.length} projects</span>
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-0.5" aria-label="Project sorting">
              {projectSortOptions.map((option, index) => (
                <Button
                  key={option}
                  type="button"
                  variant={index === 0 ? 'emphasis' : 'ghost'}
                  size="sm"
                  disabled
                  className="h-8 disabled:opacity-100"
                >
                  {option}
                </Button>
              ))}
            </div>
            <DisabledAction
              variant="outline"
              className="h-8 px-3 disabled:opacity-100"
              ariaLabel="Filter projects"
            >
              <SlidersHorizontal className="size-3" />
              Filters
            </DisabledAction>
          </div>
        </div>

        <div className="mt-8 grid gap-x-6 gap-y-7 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <PublicProjectCard key={project.id} project={project} />
          ))}
        </div>

        <div className="mt-12 flex justify-center">
          <DisabledAction
            variant="outline"
            className="h-11 gap-1 px-5 shadow-sm disabled:opacity-100"
          >
            View all projects
            <ArrowDown className="size-3" />
          </DisabledAction>
        </div>
      </div>
    </section>
  );
}

function StorySection({ profile }: { profile: PublicDesignerProfileViewModel }) {
  return (
    <section className="overflow-hidden px-4 pt-0 pb-24 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <SectionEyebrow>Project narrative</SectionEyebrow>
        <h2 className="mt-2 text-4xl tracking-tight">
          their <span className="font-light text-primary italic">words</span>.
        </h2>

        <div className="relative mt-7 border bg-muted/30 px-6 py-10 sm:px-12 lg:px-16">
          <span
            className="absolute top-2 left-2 size-5 border-t border-l border-primary/20"
            aria-hidden="true"
          />
          <span
            className="absolute top-2 right-2 size-5 border-t border-r border-primary/20"
            aria-hidden="true"
          />
          <span
            className="absolute bottom-2 left-2 size-5 border-b border-l border-primary/20"
            aria-hidden="true"
          />
          <span
            className="absolute right-2 bottom-2 size-5 border-r border-b border-primary/20"
            aria-hidden="true"
          />

          <div className="grid gap-10 lg:grid-cols-12 lg:items-center">
            <div className="lg:col-span-8">
              <Quote className="size-10 rotate-180 fill-primary text-primary" />
              <blockquote className="mt-5 max-w-2xl text-2xl leading-snug sm:text-3xl">
                Our pooja room alone made my mother cry. They understood our family before they
                understood our floor plan.
              </blockquote>
              <footer className="mt-7 flex items-center gap-3">
                <div className="grid size-11 shrink-0 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                  AS
                </div>
                <div>
                  <p className="text-sm font-medium">Priya & Rohan K., 3BHK in Adyar</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    From a homeowner · {profile.studioName}
                  </p>
                </div>
              </footer>
            </div>

            <Card
              className="mx-auto w-full max-w-72 -rotate-2 overflow-hidden shadow-sm lg:col-span-4 lg:-my-16 lg:-translate-y-8 lg:justify-self-end"
              radius="lg"
            >
              <div className="p-5">
                <div className="flex items-start gap-3">
                  <Image
                    src="/illustrations/public-profile/studio-card-logo.png"
                    alt={`${profile.studioName} studio mark`}
                    width={68}
                    height={68}
                    className="size-17 rounded-lg border-2 border-background object-cover shadow-md"
                  />
                  <div className="min-w-0 pt-1">
                    <p className="font-mono text-2xs tracking-widest text-muted-foreground uppercase">
                      {profile.studioType}
                    </p>
                    <p className="mt-1 flex items-center gap-1 font-medium">
                      <span className="truncate">{profile.studioName}</span>
                      <BadgeCheck className="size-4 shrink-0 fill-primary text-primary-foreground" />
                    </p>
                    <p className="mt-1 flex items-center gap-1 font-mono text-2xs tracking-wider uppercase">
                      <Shield className="size-2.5" />
                      KYC verified
                    </p>
                  </div>
                </div>

                <div className="mt-5 space-y-2 text-sm">
                  <p className="flex items-center gap-1.5">
                    <FolderKanban className="size-3.5 text-muted-foreground" />
                    <span>{profile.completedProjects}+ Projects</span>
                    <span className="text-muted-foreground">published</span>
                  </p>
                  <p className="flex items-center gap-1.5">
                    <CalendarDays className="size-3.5 text-muted-foreground" />
                    <span>2018</span>
                    <span className="text-muted-foreground">
                      ({profile.yearsExperience} Years of Experience)
                    </span>
                  </p>
                  <p className="flex items-center gap-1.5">
                    <Star className="size-3.5 fill-muted-foreground text-muted-foreground" />
                    <span>{profile.rating}</span>
                    <span className="text-muted-foreground">
                      ({profile.reviewCount} verified reviews)
                    </span>
                  </p>
                </div>

                <DisabledAction variant="emphasis" className="mt-5 h-8 w-full disabled:opacity-100">
                  <MessageSquare className="size-4" />
                  Enquire
                </DisabledAction>
              </div>

              <div className="flex items-center justify-between border-t px-5 py-3 text-primary">
                <ShieldCheck className="size-4" aria-label="Verified by Tickif" />
                <span className="inline-flex items-center gap-1 font-mono text-2xs leading-none tracking-wider uppercase">
                  <span>{profile.rating}</span>
                  <Star className="block size-2.5 shrink-0 fill-current" aria-hidden="true" />
                  <span>· {profile.reviewCount}</span>
                </span>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </section>
  );
}

function ReviewCard({ review }: { review: PublicDesignerReview }) {
  return (
    <Card className="flex min-w-100 flex-col gap-4 p-4 shadow-md" radius="xl">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Image
            src={review.imageSrc}
            alt=""
            width={48}
            height={48}
            className="size-12 rounded-full object-cover"
          />
          <div>
            <p className="flex items-center gap-1 text-sm font-medium">
              {review.author}
              <BadgeCheck className="size-4 fill-primary text-primary-foreground" />
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{review.date}</p>
          </div>
        </div>
        <GoogleBrandIcon className="size-6" />
      </div>
      <p className="flex-1 text-sm leading-relaxed">“{review.body}”</p>
      <div className="flex items-center justify-between gap-4">
        <Rating rating={review.rating} size="lg" />
        <span className="-rotate-3 font-display text-2xl italic tracking-wide text-muted-foreground">
          {review.author}
        </span>
      </div>
    </Card>
  );
}

function ReviewsSection({ profile }: { profile: PublicDesignerProfileViewModel }) {
  return (
    <section className="border-t border-surface-subtle-border bg-surface-subtle px-4 py-22 sm:px-6">
      <div className="mx-auto max-w-7xl">
        <SectionEyebrow>Ratings & client voices</SectionEyebrow>
        <h2
          className="mt-2 max-w-2xl text-4xl font-medium"
          aria-label="What it’s like to work with us."
        >
          What it’s like to <span className="font-light text-primary italic">work with us</span>.
        </h2>
        <div className="mt-9 flex gap-8 overflow-x-auto pb-20">
          <Card
            className="shadow-floating-card relative flex min-h-56 min-w-60 flex-col justify-between overflow-hidden border-surface-inverse-foreground/15 bg-surface-inverse p-5 text-surface-inverse-foreground"
            radius="xl"
          >
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -inset-y-24 left-4 w-8 rotate-12 -skew-x-6 bg-linear-to-r from-transparent via-surface-inverse-foreground/20 to-transparent opacity-80"
            />
            <div className="relative border-b border-surface-inverse-foreground/10 pb-3">
              <p className="font-mono text-xs tracking-widest text-surface-inverse-foreground/40 uppercase">
                {profile.studioName}
              </p>
            </div>
            <p className="relative text-7xl font-normal tracking-tight">{profile.rating}</p>
            <div className="relative">
              <Rating rating={profile.rating} />
              <p className="mt-2 text-sm text-surface-inverse-foreground">
                Based on {profile.reviewCount} verified reviews
              </p>
            </div>
          </Card>
          <div className="flex gap-6">
            {profile.reviews.map((review) => (
              <ReviewCard key={review.id} review={review} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function StudioDetailsSection({ profile }: { profile: PublicDesignerProfileViewModel }) {
  const establishedYear = new Date().getFullYear() - profile.yearsExperience;

  return (
    <section className="bg-background px-4 py-20 sm:px-6">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-10 lg:flex-row lg:items-stretch lg:justify-between lg:gap-14">
          <div className="max-w-4xl">
            <SectionEyebrow>The studio</SectionEyebrow>
            <div className="mt-2 flex items-center gap-3.5">
              <div className="grid size-14 shrink-0 place-items-center rounded-full bg-foreground text-sm font-semibold text-background">
                AS
              </div>
              <div>
                <div className="flex items-center gap-1">
                  <h2 className="text-2xl font-medium">{profile.studioName}</h2>
                  <BadgeCheck
                    className="size-5 shrink-0 fill-primary text-primary-foreground"
                    aria-label="Verified studio"
                  />
                </div>
                <p className="mt-1 font-mono text-2xs font-semibold tracking-widest text-muted-foreground uppercase">
                  {profile.studioType}
                </p>
              </div>
            </div>
            <p className="mt-5 max-w-lg text-sm leading-relaxed text-muted-foreground">
              Anika Spaces is a boutique residential design studio led by Anika Subramanian. We
              focus on full-home interiors for thoughtful homeowners, projects where craftsmanship,
              daylight, and material honesty matter more than trends. Our studio operates out of
              Adyar with site teams across Chennai and Coimbatore.
            </p>
          </div>
          <dl className="grid grid-cols-3 gap-6 border-t pt-8 lg:w-72 lg:grid-cols-1 lg:gap-6 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-10">
            <div className="flex flex-col">
              <dt className="order-2 mt-1 font-mono text-xs tracking-widest text-muted-foreground uppercase">
                Established
              </dt>
              <dd className="order-1 text-4xl font-normal tracking-tight">{establishedYear}</dd>
            </div>
            <div className="flex flex-col">
              <dt className="order-2 mt-1 font-mono text-xs tracking-widest text-muted-foreground uppercase">
                Projects published
              </dt>
              <dd className="order-1 text-4xl font-normal tracking-tight">
                {profile.completedProjects}
              </dd>
            </div>
            <div className="flex flex-col">
              <dt className="order-2 mt-1 font-mono text-xs tracking-widest text-muted-foreground uppercase">
                Typical budget
              </dt>
              <dd className="order-1 text-4xl font-normal tracking-tight">
                {profile.typicalBudget}
              </dd>
            </div>
          </dl>
        </div>
        <div className="mt-8 flex flex-wrap items-center gap-2 border-t pt-3">
          <span className="inline-flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-1.5 text-sm text-muted-foreground">
            <InstagramBrandIcon className="size-4" />
            @anika
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-1.5 text-sm text-muted-foreground">
            <LinkedInBrandIcon className="size-4" />
            @anika
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-1.5 text-sm text-muted-foreground">
            <Facebook className="size-4 text-info" />
            @anika
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-1.5 text-sm text-muted-foreground">
            <Globe className="size-4 text-muted-foreground" />
            anikaspaces.in
          </span>
        </div>
      </div>
    </section>
  );
}

function ShareSection({
  profile,
  publicProfileHref,
  publicProfileLabel,
}: {
  profile: PublicDesignerProfileViewModel;
  publicProfileHref: string;
  publicProfileLabel: string;
}) {
  return (
    <section className="overflow-hidden bg-muted px-4 py-20 sm:px-6">
      <div className="mx-auto grid max-w-6xl gap-16 lg:grid-cols-5 lg:items-center">
        <div className="mx-auto w-full max-w-sm py-6 lg:col-span-2">
          <Card className="-rotate-2 overflow-hidden shadow-2xl" radius="2xl">
            <div className="relative h-56">
              <Image
                src="/illustrations/public-profile/share-card.jpg"
                alt="Anika Spaces portfolio preview"
                fill
                sizes="360px"
                className="object-cover"
              />
              <div
                className="absolute inset-0 bg-gradient-to-t from-foreground/20 to-transparent"
                aria-hidden="true"
              />
            </div>

            <div className="relative px-5 pb-5 text-center">
              <div className="mx-auto -mt-6 grid size-11 place-items-center rounded-full border-4 border-background bg-foreground text-sm font-semibold text-background shadow-sm">
                AS
              </div>

              <div className="mt-2 flex items-center justify-center gap-1">
                <p className="text-xl font-medium">{profile.studioName}</p>
                <BadgeCheck className="size-5 fill-primary text-primary-foreground" />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Adyar, Chennai</p>

              <span className="mt-4 inline-flex items-center gap-2 rounded-full bg-secondary px-4 py-2 font-mono text-xs">
                <Link2 className="size-3" />
                {publicProfileLabel}
              </span>
            </div>
          </Card>
        </div>

        <div className="lg:col-span-3">
          <p className="font-mono text-xs font-medium tracking-widest uppercase">
            One link. Everywhere.
          </p>
          <h2 className="mt-3 text-4xl tracking-tight">
            A portfolio worth <span className="font-light text-muted-foreground">sharing</span>.
          </h2>
          <p className="mt-5 max-w-md leading-relaxed text-muted-foreground">
            This is Anika Spaces&apos;s living portfolio, every project, rating and detail in one
            verified link. Send it on WhatsApp, drop it in your Instagram bio, or print it on a
            card.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <DisabledAction variant="emphasis" className="h-10 px-6 shadow-sm disabled:opacity-100">
              <MessageSquare className="size-4" />
              Enquire
            </DisabledAction>
            <CopyLinkButton
              value={publicProfileHref}
              variant="outline"
              className="h-10 px-4 shadow-sm"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function ConsultationSection({ profile }: { profile: PublicDesignerProfileViewModel }) {
  return (
    <section className="bg-surface-inverse px-6 py-24 text-surface-inverse-foreground">
      <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
        <p className="font-mono text-xs tracking-widest text-surface-inverse-foreground/60 uppercase">
          Direct line to the designer
        </p>
        <h2 className="mt-4 text-4xl leading-none font-medium tracking-tight sm:text-5xl">
          <span className="block">Let&apos;s build something</span>
          <span className="block">
            you{' '}
            <span className="font-light text-surface-inverse-foreground/70">
              can&apos;t imagine
            </span>
          </span>
          <span className="block">living without.</span>
        </h2>
        <p className="mt-6 max-w-md leading-6 text-surface-inverse-foreground/80">
          Anika Spaces typically replies in under 4 hours. The first conversation is always free.
        </p>
        <div className="mt-9 flex flex-wrap justify-center gap-3">
          <DisabledAction className="h-12 rounded-full bg-surface-inverse-foreground px-7 text-surface-inverse disabled:opacity-100 hover:bg-surface-inverse-foreground/90">
            <MessageSquare className="size-5" />
            Get free consultation
          </DisabledAction>
          <DisabledAction
            variant="outline"
            className="h-12 rounded-full border-surface-inverse-foreground bg-transparent px-7 text-surface-inverse-foreground disabled:opacity-100 hover:bg-surface-inverse-foreground/10 hover:text-surface-inverse-foreground"
          >
            <Bookmark className="size-5" />
            {profile.bookmarkCount}
          </DisabledAction>
        </div>
        <p className="mt-7 font-mono text-xs tracking-wider text-surface-inverse-foreground/55 uppercase">
          No commitment · No middlemen · No sales calls
        </p>
      </div>
    </section>
  );
}

export function PublicDesignerProfile({ profile }: { profile: PublicDesignerProfileViewModel }) {
  const publicProfileUrl = new URL(`/d/${profile.slug}`, env.NEXT_PUBLIC_WEB_URL);
  const publicProfileHref = publicProfileUrl.toString();
  const publicProfileLabel = `${publicProfileUrl.host}${publicProfileUrl.pathname}`;

  return (
    <main className="min-h-screen overflow-x-hidden bg-background text-foreground">
      <TrustStrip items={profileTrustItems} />
      <StudioBar profile={profile} publicProfileHref={publicProfileHref} />
      <HeroSection profile={profile} />
      <CredentialsSection />
      <PortfolioSection profile={profile} />
      <StorySection profile={profile} />
      <ReviewsSection profile={profile} />
      <StudioDetailsSection profile={profile} />
      <ShareSection
        profile={profile}
        publicProfileHref={publicProfileHref}
        publicProfileLabel={publicProfileLabel}
      />
      <ConsultationSection profile={profile} />
    </main>
  );
}
