import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  BadgeCheck,
  Bookmark,
  CalendarDays,
  Check,
  Globe,
  Link2,
  MessageCircle,
  MessageSquare,
  Quote,
  Shield,
  Sparkle,
  Star,
} from 'lucide-react';
import type {
  PortfolioBadge,
  PublicPortfolioResponse,
  PublicPortfolioReview,
} from '@repo/contracts';
import { Badge } from '@repo/ui/components/badge';
import { buttonVariants } from '@repo/ui/components/button';
import { Card } from '@repo/ui/components/card';
import { Rating } from '@repo/ui/components/reui/rating';
import { cn } from '@repo/ui/lib/utils';
import { CopyLinkButton } from '@/components/copy-link-button';
import {
  GoogleBrandIcon,
  InstagramBrandIcon,
  LinkedInBrandIcon,
  TickifBrandIcon,
  YouTubeBrandIcon,
} from '@/components/brand-icons';
import { TrustStrip, type TrustStripItem } from '@/components/trust-strip';
import { PublicProjectGallery } from '@/components/public-project-gallery';
import {
  formatRating,
  heroCaption,
  heroProject,
  socialLabel,
  strapline,
  studioInitials,
  studioLocation,
  studioType,
  websiteLabel,
} from '@/lib/public-portfolio-view';

/** Badge artwork + alt text, keyed by the `PortfolioBadge` values the API awards. */
const BADGE_PRESENTATION: Record<PortfolioBadge, { label: string; imageSrc: string }> = {
  verified: { label: 'Identity verified', imageSrc: '/illustrations/badges/verified.svg' },
  new: { label: 'New on Tickif', imageSrc: '/illustrations/badges/new.svg' },
  'top-performer': { label: 'Top performer', imageSrc: '/illustrations/badges/top-performer.svg' },
  established: { label: 'Established studio', imageSrc: '/illustrations/badges/established.svg' },
  'projects-published': {
    label: 'Projects published',
    imageSrc: '/illustrations/badges/projects-published.svg',
  },
};

const profileTrustItems = [
  { icon: Check, label: 'Every project verified before it goes live' },
  { icon: Shield, label: 'Every designer phone-verified' },
  { icon: Sparkle, label: 'Free to browse · No middlemen' },
] satisfies TrustStripItem[];

/** Everything the sections need that isn't on the API payload. */
type ProfileView = {
  initials: string;
  type: string;
  location: string | null;
  pitch: string | null;
  hero: ReturnType<typeof heroProject>;
  heroCaption: string | null;
  publicProfileHref: string;
  publicProfileLabel: string;
  loginHref: string;
};

type SectionProps = {
  portfolio: PublicPortfolioResponse;
  view: ProfileView;
};

function LoginGatedAction({
  children,
  className,
  variant = 'default',
  ariaLabel,
  href,
}: {
  children: ReactNode;
  className?: string;
  variant?: 'default' | 'emphasis' | 'outline' | 'secondary' | 'ghost';
  ariaLabel?: string;
  href: string;
}) {
  return (
    <Link href={href} aria-label={ariaLabel} className={cn(buttonVariants({ variant }), className)}>
      {children}
    </Link>
  );
}

function SectionEyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="font-mono text-xs font-medium tracking-widest text-muted-foreground uppercase">
      {children}
    </p>
  );
}

/** Logo when the designer uploaded one, else an initials monogram. */
function StudioMark({
  portfolio,
  view,
  className,
  sizePx,
}: SectionProps & { className: string; sizePx: number }) {
  if (portfolio.logoUrl) {
    return (
      <Image
        src={portfolio.logoUrl}
        alt={`${portfolio.displayName} logo`}
        width={sizePx}
        height={sizePx}
        // Presigned storage URL: the signature rotates hourly, so the optimizer
        // could never reuse a cache entry. Matches the settings page.
        unoptimized
        className={`${className} shrink-0 rounded-full object-cover`}
      />
    );
  }
  return (
    <div
      className={`${className} grid shrink-0 place-items-center rounded-full bg-foreground font-semibold text-background`}
      aria-hidden="true"
    >
      {view.initials}
    </div>
  );
}

function StudioBar({ portfolio, view }: SectionProps) {
  const headlineRating = portfolio.sections.overallRating
    ? (portfolio.stats.tickif ?? portfolio.stats.google)
    : null;

  return (
    <div className="border-b bg-background/95">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-2.5 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <StudioMark portfolio={portfolio} view={view} className="size-9 text-xs" sizePx={36} />
          <div className="min-w-0">
            <p className="flex items-center gap-1 truncate text-sm font-medium">
              {portfolio.displayName}
              {portfolio.sections.tickifBadge ? (
                <BadgeCheck className="size-4 shrink-0 fill-primary text-primary-foreground" />
              ) : null}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {view.type}
              {headlineRating && headlineRating.reviewCount > 0 ? (
                <>
                  {' · '}
                  <span className="inline-flex -translate-y-px items-center gap-1 align-middle">
                    <Star className="size-3 fill-warning text-warning" />
                    <span>{formatRating(headlineRating.rating)}</span>
                  </span>
                </>
              ) : null}
              {view.location ? ` · ${view.location}` : null}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {portfolio.sections.shareBlock ? (
            <CopyLinkButton
              value={view.publicProfileHref}
              label="Share"
              icon="share"
              variant="outline"
              className="hidden h-9 rounded-full px-4 sm:inline-flex"
            />
          ) : null}
          <LoginGatedAction
            variant="emphasis"
            ariaLabel="Start a conversation"
            className="h-9 rounded-full px-4"
            href={view.loginHref}
          >
            <MessageCircle className="size-4" />
            <span className="hidden sm:inline">Start a conversation</span>
            <span className="sm:hidden">Start</span>
          </LoginGatedAction>
        </div>
      </div>
    </div>
  );
}

/** One cell of the hero proof strip. */
type HeroStatTile = { value: string; label: string; detail: string };

function HeroSection({ portfolio, view }: SectionProps) {
  const { stats } = portfolio;
  const headlineSource = stats.tickif ? 'tickif' : 'google';
  const headlineRating = portfolio.sections.overallRating
    ? (stats.tickif ?? stats.google)
    : null;

  // Only stats the designer actually has data for — an empty tile reads as broken.
  const candidates: (HeroStatTile | null)[] = [
    headlineRating && headlineRating.reviewCount > 0
      ? {
          value: formatRating(headlineRating.rating),
          label: 'Rating',
          detail:
            headlineSource === 'tickif'
              ? `${headlineRating.reviewCount} verified reviews`
              : `${headlineRating.reviewCount} Google reviews`,
        }
      : null,
    stats.projectCount > 0
      ? { value: String(stats.projectCount), label: 'Projects', detail: 'Published on Tickif' }
      : null,
    portfolio.foundedYear
      ? {
          value: String(portfolio.foundedYear),
          label: 'Established',
          detail:
            stats.yearsExperience > 0 ? `${stats.yearsExperience}+ years experience` : 'Studio',
        }
      : null,
    stats.startingBudget
      ? { value: stats.startingBudget, label: 'Typical budget', detail: 'Across published work' }
      : null,
  ];
  const tiles = candidates.filter((tile): tile is HeroStatTile => tile !== null);

  return (
    <section className="grid border-b lg:grid-cols-12">
      <div className="flex items-center px-4 py-14 sm:px-8 lg:col-span-7 lg:px-12">
        <div className="mx-auto w-full max-w-xl">
          <div className="mb-7 flex items-start justify-between gap-4 border-b pb-7">
            <div className="flex min-w-0 items-center gap-3">
              <StudioMark
                portfolio={portfolio}
                view={view}
                className="size-11 text-sm"
                sizePx={44}
              />
              <div className="min-w-0">
                <Badge variant="secondary" className="rounded-sm uppercase">
                  {view.type}
                </Badge>
                {view.location ? (
                  <p className="mt-1 truncate text-xs text-muted-foreground">{view.location}</p>
                ) : null}
              </div>
            </div>
            {portfolio.badges.includes('verified') ? (
              <span className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full border px-3 text-xs">
                <Shield className="size-3" />
                Verified
              </span>
            ) : null}
          </div>

          <p className="font-mono text-xs font-medium tracking-widest uppercase">
            Portfolio on Tickif
          </p>
          <h1 className="mt-2 text-5xl leading-none tracking-tight sm:text-6xl">
            {portfolio.displayName}
          </h1>
          {view.pitch ? (
            <p className="mt-2 max-w-md text-lg leading-relaxed text-muted-foreground">
              {view.pitch}
            </p>
          ) : null}

          {tiles.length > 0 ? (
            <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded border bg-border p-px sm:grid-cols-4">
              {tiles.map((tile) => (
                <div
                  key={tile.label}
                  className="flex min-h-20 flex-col justify-center bg-background px-3 py-4"
                >
                  <dd className="text-2xl leading-none">{tile.value}</dd>
                  <dt className="mt-2 text-xs font-medium">{tile.label}</dt>
                  <p className="mt-1 text-xs leading-tight text-muted-foreground">{tile.detail}</p>
                </div>
              ))}
            </dl>
          ) : null}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <LoginGatedAction variant="emphasis" className="min-w-36" href={view.loginHref}>
              <MessageSquare className="size-4" />
              Enquire
            </LoginGatedAction>
            <LoginGatedAction
              variant="outline"
              className="text-primary"
              href={view.loginHref}
              ariaLabel="Save profile"
            >
              <Bookmark className="size-4 fill-current" />
              Save
            </LoginGatedAction>
          </div>
        </div>
      </div>

      {view.hero?.coverImageUrl ? (
        <figure className="flex min-h-96 flex-col bg-muted lg:col-span-5 lg:min-h-full">
          <div className="relative min-h-96 flex-1">
            <Image
              src={view.hero.coverImageUrl}
              alt={`${view.hero.title} by ${portfolio.displayName}`}
              fill
              priority
              unoptimized
              sizes="(min-width: 1024px) 42vw, 100vw"
              className="object-cover"
            />
          </div>
          {view.heroCaption ? (
            <figcaption className="border-t bg-muted px-5 py-3 font-mono text-xs tracking-wider text-muted-foreground uppercase">
              {view.heroCaption}
            </figcaption>
          ) : null}
        </figure>
      ) : null}
    </section>
  );
}

function CredentialsSection({ portfolio }: SectionProps) {
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
          {portfolio.badges.map((badge) => {
            const { label, imageSrc } = BADGE_PRESENTATION[badge];
            return (
              <li key={badge}>
                <Image src={imageSrc} alt={label} width={160} height={176} className="h-44 w-40" />
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

function PortfolioSection({ portfolio, view }: SectionProps) {
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
              {portfolio.stats.projectCount}{' '}
              <span className="font-normal text-muted-foreground">published</span>
            </p>
            {portfolio.bio ? (
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{portfolio.bio}</p>
            ) : null}
          </div>
        </div>

        <PublicProjectGallery
          profileId={portfolio.profileId}
          initialPage={portfolio.projects}
          studioName={portfolio.displayName}
          emptyMessage={`${view.type} — no published projects yet.`}
        />
      </div>
    </section>
  );
}

function StorySection({ portfolio, view }: SectionProps) {
  const testimonial = portfolio.testimonial;
  const headlineSource = portfolio.stats.tickif ? 'tickif' : 'google';
  const headlineRating = portfolio.sections.overallRating
    ? (portfolio.stats.tickif ?? portfolio.stats.google)
    : null;
  if (!testimonial) return null;

  const attribution = [testimonial.author, testimonial.projectTitle]
    .filter((part): part is string => !!part)
    .join(', ');

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
                {testimonial.words}
              </blockquote>
              {attribution ? (
                <footer className="mt-7 flex items-center gap-3">
                  <div className="grid size-11 shrink-0 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                    {studioInitials(testimonial.author ?? portfolio.displayName)}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{attribution}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      From a homeowner · {portfolio.displayName}
                    </p>
                  </div>
                </footer>
              ) : null}
            </div>

            <Card
              className="mx-auto w-full max-w-72 -rotate-2 overflow-hidden shadow-sm lg:col-span-4 lg:-my-16 lg:-translate-y-8 lg:justify-self-end"
              radius="lg"
            >
              <div className="p-5">
                <div className="flex items-start gap-3">
                  <StudioMark
                    portfolio={portfolio}
                    view={view}
                    className="size-17 text-lg"
                    sizePx={68}
                  />
                  <div className="min-w-0 pt-1">
                    <p className="font-mono text-2xs tracking-widest text-muted-foreground uppercase">
                      {view.type}
                    </p>
                    <p className="mt-1 flex items-center gap-1 font-medium">
                      <span className="truncate">{portfolio.displayName}</span>
                      {portfolio.sections.tickifBadge ? (
                        <BadgeCheck className="size-4 shrink-0 fill-primary text-primary-foreground" />
                      ) : null}
                    </p>
                    {portfolio.badges.includes('verified') ? (
                      <p className="mt-1 flex items-center gap-1 font-mono text-2xs tracking-wider uppercase">
                        <Shield className="size-2.5" />
                        KYC verified
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="mt-5 space-y-2 text-sm">
                  <p className="flex items-center gap-1.5">
                    <TickifBrandIcon
                      className="size-3 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <span>{portfolio.stats.projectCount} Projects</span>
                    <span className="text-muted-foreground">published</span>
                  </p>
                  {portfolio.foundedYear ? (
                    <p className="flex items-center gap-1.5">
                      <CalendarDays className="size-3.5 text-muted-foreground" />
                      <span>{portfolio.foundedYear}</span>
                      {portfolio.stats.yearsExperience > 0 ? (
                        <span className="text-muted-foreground">
                          ({portfolio.stats.yearsExperience} Years of Experience)
                        </span>
                      ) : null}
                    </p>
                  ) : null}
                  {headlineRating && headlineRating.reviewCount > 0 ? (
                    <p className="flex items-center gap-1.5">
                      <Star className="size-3 fill-muted-foreground text-muted-foreground" />
                      <span>{formatRating(headlineRating.rating)}</span>
                      <span className="text-muted-foreground">
                        (
                        {headlineSource === 'tickif'
                          ? `${headlineRating.reviewCount} verified reviews`
                          : `${headlineRating.reviewCount} Google reviews`}
                        )
                      </span>
                    </p>
                  ) : null}
                </div>

                <LoginGatedAction
                  variant="emphasis"
                  className="mt-5 h-8 w-full"
                  href={view.loginHref}
                >
                  <MessageSquare className="size-4" />
                  Enquire
                </LoginGatedAction>
              </div>

              {headlineRating && headlineRating.reviewCount > 0 ? (
                <div className="flex items-center justify-between border-t px-5 py-3 text-muted-foreground">
                  <TickifBrandIcon role="img" aria-label="Tickif" className="size-4 text-primary" />
                  <span className="inline-flex items-center gap-1 font-mono text-2xs leading-none tracking-wider uppercase">
                    <span>{formatRating(headlineRating.rating)}</span>
                    <Star className="block size-2.5 shrink-0 fill-current" aria-hidden="true" />
                    <span>· {headlineRating.reviewCount}</span>
                  </span>
                </div>
              ) : null}
            </Card>
          </div>
        </div>
      </div>
    </section>
  );
}

function ReviewCard({ review }: { review: PublicPortfolioReview }) {
  return (
    <Card
      role="article"
      className="flex h-55 w-100 shrink-0 flex-col gap-4 p-4 shadow-md"
      radius="xl"
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {review.avatarUrl ? (
            <Image
              src={review.avatarUrl}
              alt=""
              width={48}
              height={48}
              // Google-hosted reviewer photo — not a configured image host.
              unoptimized
              className="size-12 rounded-full object-cover"
            />
          ) : (
            <div
              className="grid size-12 shrink-0 place-items-center rounded-full bg-muted text-sm font-semibold text-muted-foreground"
              aria-hidden="true"
            >
              {studioInitials(review.author)}
            </div>
          )}
          <div>
            <p className="flex items-center gap-1 text-sm font-medium">
              {review.author}
              {review.verifiedConsultation ? (
                <BadgeCheck
                  aria-label="Verified consultation"
                  className="size-4 fill-primary text-primary-foreground"
                />
              ) : null}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{review.relativeTime}</p>
          </div>
        </div>
        {review.source === 'google' ? (
          <GoogleBrandIcon className="size-6" />
        ) : (
          <TickifBrandIcon className="size-6 text-primary" />
        )}
      </div>
      {review.text ? (
        <p className="flex-1 text-sm leading-relaxed">“{review.text}”</p>
      ) : (
        <div className="flex-1" aria-hidden="true" />
      )}
      <Rating rating={review.rating} size="lg" />
    </Card>
  );
}

function ReviewAggregateCard({
  source,
  rating,
  reviewCount,
}: {
  source: 'tickif' | 'google';
  rating: number;
  reviewCount: number;
}) {
  return (
    <Card
      className="shadow-floating-card relative flex min-h-56 w-60 shrink-0 flex-col justify-between overflow-hidden border-surface-inverse-foreground/15 bg-surface-inverse p-5 text-surface-inverse-foreground"
      radius="xl"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-y-24 left-4 w-8 rotate-12 -skew-x-6 bg-linear-to-r from-transparent via-surface-inverse-foreground/20 to-transparent opacity-80"
      />
      <div className="relative flex items-center justify-between border-b border-surface-inverse-foreground/10 pb-3">
        <p className="font-mono text-xs tracking-widest text-surface-inverse-foreground/60 uppercase">
          {source === 'tickif' ? 'Tickif' : 'Google'}
        </p>
        {source === 'tickif' ? (
          <TickifBrandIcon className="size-4 text-primary" />
        ) : (
          <GoogleBrandIcon className="size-4" />
        )}
      </div>
      <p className="relative text-7xl font-normal tracking-tight">
        {formatRating(rating)}
      </p>
      <div className="relative">
        <Rating rating={rating} />
        <p className="mt-2 text-sm text-surface-inverse-foreground">
          Based on {reviewCount}{' '}
          {source === 'tickif' ? 'verified reviews' : 'Google reviews'}
        </p>
      </div>
    </Card>
  );
}

function ReviewsSection({ portfolio }: SectionProps) {
  const { reviews, stats } = portfolio;
  const reviewAggregates = portfolio.sections.overallRating
    ? [
        stats.tickif
          ? { source: 'tickif' as const, ...stats.tickif }
          : null,
        stats.google
          ? { source: 'google' as const, ...stats.google }
          : null,
      ].filter((aggregate): aggregate is NonNullable<typeof aggregate> => aggregate !== null)
    : [];

  return (
    <section className="overflow-hidden border-t border-surface-subtle-border bg-surface-subtle px-4 py-22 sm:px-6">
      <div className="mx-auto max-w-7xl">
        <SectionEyebrow>Ratings & client voices</SectionEyebrow>
        <h2
          className="mt-2 max-w-2xl text-4xl font-medium"
          aria-label="What it’s like to work with us."
        >
          What it’s like to <span className="font-light text-primary italic">work with us</span>.
        </h2>
        <div className="mt-9 flex flex-col gap-8 pb-20 md:flex-row">
          {reviewAggregates.length > 0 ? (
            <div className="flex shrink-0 gap-4">
              {reviewAggregates.map((aggregate) => (
                <ReviewAggregateCard key={aggregate.source} {...aggregate} />
              ))}
            </div>
          ) : null}

          {reviews.length > 0 ? (
            <div
              data-testid="review-marquee"
              className="review-marquee w-screen shrink-0 overflow-hidden py-4"
            >
              <div className="review-marquee-track flex w-max">
                <div data-testid="review-marquee-primary" className="flex shrink-0 gap-6 pr-6">
                  {reviews.map((review) => (
                    <ReviewCard key={review.id} review={review} />
                  ))}
                </div>
                <div
                  data-testid="review-marquee-copy"
                  className="review-marquee-copy flex shrink-0 gap-6 pr-6"
                  aria-hidden="true"
                >
                  {reviews.map((review) => (
                    <ReviewCard key={review.id} review={review} />
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <p className="self-center text-sm text-muted-foreground">
              No reviews are available for {portfolio.displayName} yet.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function StudioDetailsSection({ portfolio, view }: SectionProps) {
  const { social, stats } = portfolio;
  const socialLinks = [
    social.instagramHandle
      ? { key: 'instagram', icon: InstagramBrandIcon, label: socialLabel(social.instagramHandle) }
      : null,
    social.linkedinHandle
      ? { key: 'linkedin', icon: LinkedInBrandIcon, label: socialLabel(social.linkedinHandle) }
      : null,
    social.youtubeHandle
      ? { key: 'youtube', icon: YouTubeBrandIcon, label: socialLabel(social.youtubeHandle) }
      : null,
  ].filter(
    (link): link is { key: string; icon: typeof InstagramBrandIcon; label: string } => !!link,
  );

  const facts = [
    portfolio.foundedYear ? { label: 'Established', value: String(portfolio.foundedYear) } : null,
    { label: 'Projects published', value: String(stats.projectCount) },
    stats.startingBudget ? { label: 'Typical budget', value: stats.startingBudget } : null,
  ].filter((fact): fact is { label: string; value: string } => !!fact);

  return (
    <section className="bg-background px-4 py-20 sm:px-6">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-10 lg:flex-row lg:items-stretch lg:justify-between lg:gap-14">
          <div className="max-w-4xl">
            <SectionEyebrow>The studio</SectionEyebrow>
            <div className="mt-2 flex items-center gap-3.5">
              <StudioMark
                portfolio={portfolio}
                view={view}
                className="size-14 text-sm"
                sizePx={56}
              />
              <div>
                <div className="flex items-center gap-1">
                  <h2 className="text-2xl font-medium">{portfolio.displayName}</h2>
                  {portfolio.sections.tickifBadge ? (
                    <BadgeCheck
                      className="size-5 shrink-0 fill-primary text-primary-foreground"
                      aria-label="Verified studio"
                    />
                  ) : null}
                </div>
                <p className="mt-1 font-mono text-2xs font-semibold tracking-widest text-muted-foreground uppercase">
                  {view.type}
                </p>
              </div>
            </div>
            {portfolio.bio ? (
              <p className="mt-5 max-w-lg text-sm leading-relaxed text-muted-foreground">
                {portfolio.bio}
              </p>
            ) : null}
          </div>
          <dl className="grid grid-cols-3 gap-6 border-t pt-8 lg:w-72 lg:grid-cols-1 lg:gap-6 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-10">
            {facts.map((fact) => (
              <div key={fact.label} className="flex flex-col">
                <dt className="order-2 mt-1 font-mono text-xs tracking-widest text-muted-foreground uppercase">
                  {fact.label}
                </dt>
                <dd className="order-1 text-4xl font-normal tracking-tight">{fact.value}</dd>
              </div>
            ))}
          </dl>
        </div>
        {socialLinks.length > 0 || social.websiteUrl ? (
          <div className="mt-8 flex flex-wrap items-center gap-2 border-t pt-3">
            {socialLinks.map(({ key, icon: Icon, label }) => (
              <span
                key={key}
                className="inline-flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-1.5 text-sm text-muted-foreground"
              >
                <Icon className="size-4" />
                {label}
              </span>
            ))}
            {social.websiteUrl ? (
              <a
                href={social.websiteUrl}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="inline-flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-1.5 text-sm text-muted-foreground hover:text-foreground"
              >
                <Globe className="size-4 text-muted-foreground" />
                {websiteLabel(social.websiteUrl)}
              </a>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function ShareSection({ portfolio, view }: SectionProps) {
  return (
    <section className="overflow-hidden bg-muted px-4 py-20 sm:px-6">
      <div className="mx-auto grid max-w-6xl gap-16 lg:grid-cols-5 lg:items-center">
        <div className="mx-auto w-full max-w-sm py-6 lg:col-span-2">
          <Card className="-rotate-2 overflow-hidden shadow-2xl" radius="2xl">
            {view.hero?.coverImageUrl ? (
              <div className="relative h-56">
                <Image
                  src={view.hero.coverImageUrl}
                  alt={`${portfolio.displayName} portfolio preview`}
                  fill
                  unoptimized
                  sizes="360px"
                  className="object-cover"
                />
                <div
                  className="absolute inset-0 bg-gradient-to-t from-foreground/20 to-transparent"
                  aria-hidden="true"
                />
              </div>
            ) : (
              <div className="h-56 bg-secondary" aria-hidden="true" />
            )}

            <div className="relative px-5 pb-5 text-center">
              <div className="mx-auto -mt-6 w-fit rounded-full border-4 border-background shadow-sm">
                <StudioMark
                  portfolio={portfolio}
                  view={view}
                  className="size-11 text-sm"
                  sizePx={44}
                />
              </div>

              <div className="mt-2 flex items-center justify-center gap-1">
                <p className="text-xl font-medium">{portfolio.displayName}</p>
                {portfolio.sections.tickifBadge ? (
                  <BadgeCheck className="size-5 fill-primary text-primary-foreground" />
                ) : null}
              </div>
              {view.location ? (
                <p className="mt-1 text-xs text-muted-foreground">{view.location}</p>
              ) : null}

              <span className="mt-4 inline-flex items-center gap-2 rounded-full bg-secondary px-4 py-2 font-mono text-xs">
                <Link2 className="size-3" />
                {view.publicProfileLabel}
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
            This is {portfolio.displayName}&apos;s living portfolio — every project, rating and
            detail in one verified link. Send it on WhatsApp, drop it in your Instagram bio, or
            print it on a card.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <LoginGatedAction
              variant="emphasis"
              className="h-10 px-6 shadow-sm"
              href={view.loginHref}
            >
              <MessageSquare className="size-4" />
              Enquire
            </LoginGatedAction>
            <CopyLinkButton
              value={view.publicProfileHref}
              variant="outline"
              className="h-10 px-4 shadow-sm"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function ConsultationSection({ portfolio, view }: SectionProps) {
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
          Start a conversation with {portfolio.displayName} on Tickif. The first conversation is
          always free.
        </p>
        <div className="mt-9 flex flex-wrap justify-center gap-3">
          <LoginGatedAction
            className="h-12 rounded-full bg-surface-inverse-foreground px-7 text-surface-inverse hover:bg-surface-inverse-foreground/90"
            href={view.loginHref}
          >
            <MessageSquare className="size-5" />
            Get free consultation
          </LoginGatedAction>
          <LoginGatedAction
            variant="outline"
            className="h-12 rounded-full border-surface-inverse-foreground bg-transparent px-7 text-surface-inverse-foreground hover:bg-surface-inverse-foreground/10 hover:text-surface-inverse-foreground"
            href={view.loginHref}
            ariaLabel="Save profile"
          >
            <Bookmark className="size-5" />
            Save
          </LoginGatedAction>
        </div>
        <p className="mt-7 font-mono text-xs tracking-wider text-surface-inverse-foreground/55 uppercase">
          No commitment · No middlemen · No sales calls
        </p>
      </div>
    </section>
  );
}

export function PublicDesignerProfile({ portfolio }: { portfolio: PublicPortfolioResponse }) {
  const projects = portfolio.projects.projects;
  const canonical = new URL(portfolio.canonicalUrl);
  const hero = heroProject(projects);

  const view: ProfileView = {
    initials: studioInitials(portfolio.displayName),
    type: studioType(portfolio),
    location: studioLocation(portfolio, projects),
    pitch: strapline(portfolio),
    hero,
    heroCaption: heroCaption(hero),
    publicProfileHref: portfolio.canonicalUrl,
    publicProfileLabel: `${canonical.host}${canonical.pathname}`,
    loginHref: `/login?next=${encodeURIComponent(canonical.pathname)}`,
  };

  const props: SectionProps = { portfolio, view };

  return (
    <main className="min-h-screen overflow-x-hidden bg-background text-foreground">
      <TrustStrip items={profileTrustItems} />
      <StudioBar {...props} />
      {portfolio.sections.hero ? <HeroSection {...props} /> : null}
      {portfolio.sections.trustCredentials && portfolio.badges.length > 0 ? (
        <CredentialsSection {...props} />
      ) : null}
      <PortfolioSection {...props} />
      {portfolio.sections.featuredTestimonial ? <StorySection {...props} /> : null}
      {portfolio.sections.reviews ? <ReviewsSection {...props} /> : null}
      <StudioDetailsSection {...props} />
      {portfolio.sections.shareBlock ? <ShareSection {...props} /> : null}
      <ConsultationSection {...props} />
    </main>
  );
}
