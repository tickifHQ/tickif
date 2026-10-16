import Image from 'next/image';
import './public-designer-profile.css';
import { ProfileFloatingEnquiry } from '@/components/profile-floating-enquiry';
import { ProfileMotion } from '@/components/profile-motion';
import { DesignerLogoAvatar } from '@/components/designer-logo-avatar';
import { TickifBrandLogo } from '@/components/tickif-brand-logo';
import { portfolioAccentStyle } from '@/lib/portfolio-accent';
import { portfolioRecognitionArtwork } from '@/lib/portfolio-recognition';
import type { ReactNode } from 'react';
import { ArrowRight, BadgeCheck, ExternalLink, Globe2, Star } from 'lucide-react';
import {
  PORTFOLIO_BADGE_PRESENTATION,
  type PublicPortfolioResponse,
  type PublicPortfolioStats,
} from '@repo/contracts';
import { Card } from '@repo/ui/components/card';
import { RecognitionBadge } from '@repo/ui/components/recognition-badge';
import { CopyLinkButton } from '@/components/copy-link-button';
import { FollowDesignerButton, FollowDesignerProvider } from '@/components/follow-designer-button';
import { EnquiryAvailabilityProvider, EnquiryCta } from '@/components/enquiry-cta';
import { ConsultationCta } from '@/components/consultation-cta';
import { PublicProjectGallery } from '@/components/public-project-gallery';
import { ProfileClientRatings } from '@/components/profile-client-ratings';
import { ProfileTestimonialQuote } from '@/components/profile-testimonial-quote';
import { ProfileExperienceCentres } from '@/components/profile-experience-centres';
import {
  GoogleBrandIcon,
  InstagramBrandIcon,
  LinkedInBrandIcon,
  YouTubeBrandIcon,
} from '@/components/brand-icons';
import { formatCompactBudgetLabel } from '@/lib/format-budget-label';
import {
  formatRating,
  socialLabel,
  socialHref,
  strapline,
  studioInitials,
  studioLocation,
  studioType,
  websiteLabel,
} from '@/lib/public-portfolio-view';

/** Everything the sections need that isn't on the API payload. */
type ProfileView = {
  initials: string;
  type: string;
  location: string | null;
  pitch: string | null;
  publicProfileHref: string;
  publicProfileLabel: string;
  loginHref: string;
};

type SectionProps = {
  portfolio: PublicPortfolioResponse;
  view: ProfileView;
};

function headlineReviewAggregate(stats: PublicPortfolioStats) {
  if (stats.tickif && stats.tickif.reviewCount > 0) {
    return { source: 'tickif' as const, ...stats.tickif };
  }
  if (stats.google && stats.google.reviewCount > 0) {
    return { source: 'google' as const, ...stats.google };
  }
  return null;
}

function safeExternalHref(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

type ProfileSocialLink = {
  key: 'instagram' | 'linkedin' | 'youtube' | 'website';
  label: string;
  href: string;
  meta?: string;
  icon: ReactNode;
};

function portfolioSocialLinks(portfolio: PublicPortfolioResponse): ProfileSocialLink[] {
  if (!portfolio.sections.socialLinks) return [];
  const { social } = portfolio;
  const links: ProfileSocialLink[] = [];
  if (social.instagramHandle) {
    const href = socialHref('instagram', social.instagramHandle);
    if (href) {
      links.push({
        key: 'instagram',
        label: 'Instagram',
        href,
        meta: socialLabel(social.instagramHandle),
        icon: <InstagramBrandIcon />,
      });
    }
  }
  if (social.youtubeHandle) {
    const href = socialHref('youtube', social.youtubeHandle);
    if (href) {
      links.push({
        key: 'youtube',
        label: 'YouTube',
        href,
        meta: socialLabel(social.youtubeHandle),
        icon: <YouTubeBrandIcon />,
      });
    }
  }
  if (social.linkedinHandle) {
    const href = socialHref('linkedin', social.linkedinHandle);
    if (href) {
      links.push({
        key: 'linkedin',
        label: 'LinkedIn',
        href,
        meta: socialLabel(social.linkedinHandle),
        icon: <LinkedInBrandIcon />,
      });
    }
  }
  const websiteHref = safeExternalHref(social.websiteUrl);
  if (websiteHref && social.websiteUrl) {
    links.push({
      key: 'website',
      label: websiteLabel(social.websiteUrl),
      href: websiteHref,
      icon: <Globe2 />,
    });
  }
  return links;
}

/** Logo when the designer uploaded one, else an initials monogram. */
function StudioMark({
  portfolio,
  view,
  className,
  sizePx,
}: SectionProps & { className: string; sizePx: number }) {
  return (
    <DesignerLogoAvatar
      logoUrl={portfolio.logoUrl}
      alt={`${portfolio.displayName} logo`}
      sizePx={sizePx}
      className={`${className} font-semibold`}
      fallback={
        <span className="grid size-full place-items-center bg-surface-inverse text-surface-inverse-foreground">
          {view.initials}
        </span>
      }
    />
  );
}

function StudioBar({ portfolio, view }: SectionProps) {
  const headlineRating = portfolio.sections.overallRating
    ? headlineReviewAggregate(portfolio.stats)
    : null;

  return (
    <div className="border-b bg-background/95">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-2.5 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <StudioMark portfolio={portfolio} view={view} className="size-9 text-xs" sizePx={36} />
          <div className="min-w-0">
            <h1 className="flex items-center gap-1 truncate text-sm font-medium">
              {portfolio.displayName}
              {portfolio.sections.tickifBadge && portfolio.isKycVerified ? (
                <BadgeCheck
                  aria-label={portfolio.isKycVerified ? 'Verified studio' : undefined}
                  aria-hidden={portfolio.isKycVerified ? undefined : true}
                  className="size-4 shrink-0 fill-primary text-primary-foreground"
                />
              ) : null}
            </h1>
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
        <div className="flex flex-wrap items-center justify-end gap-2">
          <ConsultationCta
            designerProfileId={portfolio.profileId}
            designerName={portfolio.displayName}
            loginHref={view.loginHref}
          />
          {portfolio.sections.shareBlock ? (
            <CopyLinkButton
              value={view.publicProfileHref}
              label="Share"
              icon="share"
              variant="outline"
              className="h-9 rounded-full px-4"
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** One cell of the hero proof strip. */
type HeroStatTile = {
  value: string;
  label: string;
  detail: string;
  variant?: 'rating';
};

function HeroIdentityCard({ portfolio, view }: SectionProps) {
  const rating = portfolio.sections.overallRating ? headlineReviewAggregate(portfolio.stats) : null;
  const projectsWithImages = portfolio.projects.projects.filter((item) => item.coverImageUrl);
  const primaryProject = projectsWithImages[0];
  const secondaryProject = projectsWithImages.find(
    (item) => item.coverImageUrl !== primaryProject?.coverImageUrl,
  );
  const heroImageUrl = portfolio.heroCoverUrl ?? primaryProject?.coverImageUrl;
  const insetProject = portfolio.heroCoverUrl
    ? primaryProject
    : (secondaryProject ?? primaryProject);
  const studioFactItems = [
    `${portfolio.stats.projectCount}+ projects`,
    portfolio.foundedYear != null ? `since ${portfolio.foundedYear}` : null,
  ].filter((item): item is string => Boolean(item));
  const bannerMeta = rating ? studioFactItems.join(' · ') : studioFactItems[0];
  const spotlightLabel = [
    rating ? 'Top rated' : 'Published studio',
    view.location?.split(' · ')[0],
    '2026',
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <div className="profile-identity-wrap">
      <div className="profile-identity-card">
        <div className="profile-cover">
          <Image
            src={heroImageUrl!}
            alt={`${portfolio.displayName} portfolio cover`}
            fill
            priority
            loading="eager"
            unoptimized
            sizes="(min-width: 768px) 362px, calc(100vw - 84px)"
            className="object-cover"
          />
        </div>
        {insetProject?.coverImageUrl ? (
          <div className="profile-detail-photo">
            <Image
              src={insetProject.coverImageUrl}
              alt={`${insetProject.title} project detail`}
              fill
              unoptimized
              loading="eager"
              sizes="(min-width: 768px) 362px, calc(100vw - 84px)"
              className="object-cover"
            />
          </div>
        ) : null}
        <div className="profile-card-spotlight">
          <Star aria-hidden="true" className="size-3 fill-current" />
          <span>{spotlightLabel}</span>
        </div>
        <div className="profile-card-banner">
          <StudioMark
            portfolio={portfolio}
            view={view}
            className="profile-card-banner-logo"
            sizePx={40}
          />
          <div className="profile-card-banner-copy">
            <p className="profile-card-banner-name">
              <span className="truncate">{portfolio.displayName}</span>
              {portfolio.sections.tickifBadge && portfolio.isKycVerified ? (
                <BadgeCheck
                  aria-hidden={portfolio.isKycVerified ? undefined : true}
                  aria-label={portfolio.isKycVerified ? 'Verified studio' : undefined}
                  className="profile-card-banner-check"
                />
              ) : null}
            </p>
            {bannerMeta ? <p className="profile-card-banner-meta">{bannerMeta}</p> : null}
          </div>
          {rating || studioFactItems[1] ? (
            <>
              <span className="profile-card-banner-divider" aria-hidden="true" />
              {rating ? (
                <div className="profile-card-rating">
                  <span>
                    <Star aria-hidden="true" className="size-3.5 fill-current" />
                    <b>{formatRating(rating.rating)}</b>
                  </span>
                  <p>{rating.reviewCount} reviews</p>
                </div>
              ) : (
                <p className="profile-card-banner-proof">{studioFactItems[1]}</p>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function HeroSection({ portfolio, view }: SectionProps) {
  const { stats } = portfolio;
  const projects = portfolio.projects.projects;
  const rating = portfolio.sections.overallRating ? headlineReviewAggregate(stats) : null;
  const hasHeroVisual = Boolean(
    portfolio.heroCoverUrl || projects.some((item) => item.coverImageUrl),
  );
  const heroDetails = [
    view.type,
    portfolio.foundedYear != null ? `Est. ${portfolio.foundedYear}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const tiles: HeroStatTile[] = [
    ...(rating
      ? [
          {
            value: formatRating(rating.rating),
            label: 'Rating',
            detail: `${rating.reviewCount} ${rating.source === 'tickif' ? 'Tickif' : 'Google'} reviews`,
            variant: 'rating' as const,
          },
        ]
      : []),
    {
      value: String(stats.projectCount),
      label: 'Projects',
      detail: 'Published on Tickif',
    },
    ...(portfolio.foundedYear != null
      ? [
          {
            value:
              stats.yearsExperience != null
                ? `${stats.yearsExperience} yrs`
                : String(portfolio.foundedYear),
            label: stats.yearsExperience != null ? 'Experience' : 'Established',
            detail:
              stats.yearsExperience != null
                ? `In practice since ${portfolio.foundedYear}`
                : 'Studio founded',
          },
        ]
      : stats.yearsExperience != null
        ? [
            {
              value: String(stats.yearsExperience),
              label: 'Years experience',
              detail: 'Studio experience',
            },
          ]
        : []),
    ...(stats.startingBudget
      ? [
          {
            value: formatCompactBudgetLabel(stats.startingBudget),
            label: 'Starting at',
            detail: 'Typical budget',
          },
        ]
      : []),
    ...(stats.officeCount != null && stats.officeCount > 0
      ? [
          {
            value: String(stats.officeCount),
            label: stats.officeCount === 1 ? 'Office' : 'Offices',
            detail: 'Studio locations',
          },
        ]
      : []),
    ...(stats.cityPresenceCount > 0
      ? [
          {
            value: String(stats.cityPresenceCount),
            label: stats.cityPresenceCount === 1 ? 'City' : 'Cities',
            detail: 'Service area',
          },
        ]
      : []),
  ].slice(0, 4);

  return (
    <section aria-label="Portfolio hero" className="profile-hero">
      <div className={`profile-shell ${hasHeroVisual ? 'profile-hero-grid' : ''}`}>
        <div className="profile-hero-copy">
          <div className="profile-hero-pills" aria-label="Studio availability and location">
            <span className="profile-hero-pill">Accepting projects</span>
            {view.location ? <span className="profile-hero-pill">{view.location}</span> : null}
          </div>
          <div className="flex min-w-0 items-center gap-3.5">
            <StudioMark
              portfolio={portfolio}
              view={view}
              className="profile-hero-avatar"
              sizePx={48}
            />
            <div className="min-w-0">
              <p className="profile-hero-studio-name">
                {portfolio.sections.tickifBadge && portfolio.isKycVerified ? (
                  <>
                    <BadgeCheck aria-hidden="true" className="profile-verified-icon" />
                    <span>Verified studio</span>
                  </>
                ) : null}
              </p>
              {heroDetails ? <p className="profile-hero-studio-meta">{heroDetails}</p> : null}
            </div>
          </div>

          <h1 className="profile-hero-title" aria-label={portfolio.displayName}>
            {portfolio.displayName}
            <span aria-hidden="true" className="profile-punctuation">
              .
            </span>
          </h1>
          {view.pitch ? (
            <p className="max-w-125 text-base leading-relaxed text-foreground-secondary sm:text-lg">
              {view.pitch}
            </p>
          ) : null}
        </div>

        {hasHeroVisual ? <HeroIdentityCard portfolio={portfolio} view={view} /> : null}

        <div className="profile-hero-lower">
          <dl className="profile-proof-grid">
            {tiles.map((tile) => (
              <div key={tile.label}>
                <dt>{tile.label}</dt>
                <dd aria-label={tile.value}>
                  <span aria-hidden="true" data-profile-count={tile.label}>
                    {tile.value}
                  </span>
                </dd>
                {tile.variant === 'rating' ? (
                  <p className="profile-proof-rating-detail">
                    <span aria-hidden="true" className="profile-proof-stars">
                      {Array.from({ length: 5 }, (_, index) => (
                        <Star key={index} className="size-3 fill-current" />
                      ))}
                    </span>
                    <span>{tile.detail}</span>
                  </p>
                ) : (
                  <p>{tile.detail}</p>
                )}
              </div>
            ))}
          </dl>

          <div className="flex flex-wrap items-center gap-3">
            <FollowDesignerButton
              designerProfileId={portfolio.profileId}
              designerName={portfolio.displayName}
              loginHref={view.loginHref}
              size="lg"
            />
            <EnquiryCta
              context={{
                type: 'designer',
                designerName: portfolio.displayName,
                designerLocation: view.location,
                designerLogoUrl: portfolio.logoUrl,
              }}
              designerProfileId={portfolio.profileId}
              loginHref={view.loginHref}
              variant="emphasis"
              ariaLabel="Send an enquiry"
              className="profile-hero-enquiry"
            >
              <span>Send an enquiry</span>
              <span className="profile-hero-enquiry-icon" aria-hidden="true">
                <ArrowRight className="size-4" />
              </span>
            </EnquiryCta>
          </div>
        </div>
      </div>
    </section>
  );
}

function ProfileHeading({
  number,
  children,
  id,
  detail,
}: {
  number?: string;
  children: ReactNode;
  id: string;
  detail?: ReactNode;
}) {
  return (
    <header className="profile-section-header">
      <h2 id={id} className="profile-heading">
        {number ? (
          <span className="profile-section-number" aria-hidden="true">
            {number}
          </span>
        ) : null}
        {children}
      </h2>
      {detail ? (
        <div className="font-mono text-metadata uppercase text-muted-foreground">{detail}</div>
      ) : null}
    </header>
  );
}

function CredentialsSection({ portfolio }: SectionProps) {
  if (portfolio.badges.length === 0) return null;
  const awardCount = portfolio.badges.length;
  return (
    <section
      id="recognition"
      aria-labelledby="recognition-heading"
      className="profile-shell profile-section"
    >
      <ProfileHeading
        id="recognition-heading"
        detail={
          <>
            {awardCount} {awardCount === 1 ? 'award' : 'awards'}
            {portfolio.sections.tickifBadge && portfolio.isKycVerified
              ? ' · Verified on Tickif'
              : null}
          </>
        }
      >
        Recognition
      </ProfileHeading>
      <ul className="profile-recognition-list">
        {portfolio.badges.map((badge) => {
          const { label } = PORTFOLIO_BADGE_PRESENTATION[badge];
          const detail =
            badge === 'established' && portfolio.foundedYear != null
              ? `Since ${portfolio.foundedYear}`
              : badge === 'projects-published'
                ? String(portfolio.stats.projectCount)
                : undefined;
          return (
            <li key={badge}>
              <RecognitionBadge
                artwork={
                  badge === 'projects-published' ? (
                    <span
                      className="profile-accent-artwork"
                      style={{ maskImage: `url("${portfolioRecognitionArtwork[badge]}")` }}
                    >
                      <Image
                        src={portfolioRecognitionArtwork[badge]}
                        alt=""
                        width={150}
                        height={132}
                        className="invisible"
                      />
                    </span>
                  ) : (
                    <Image
                      src={portfolioRecognitionArtwork[badge]}
                      alt=""
                      width={150}
                      height={132}
                    />
                  )
                }
                label={label}
                detail={detail}
                description={undefined}
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function PortfolioSection({ portfolio, view }: SectionProps) {
  if (
    portfolio.stats.projectCount === 0 &&
    portfolio.projects.projects.length === 0 &&
    !portfolio.projects.hasMore
  )
    return null;
  return (
    <section id="work" className="profile-shell profile-section" aria-labelledby="projects-heading">
      <ProfileHeading id="projects-heading">Selected projects</ProfileHeading>
      <PublicProjectGallery
        profileId={portfolio.profileId}
        initialPage={portfolio.projects}
        studioName={portfolio.displayName}
        fallbackBudgetLabel={
          portfolio.stats.startingBudget
            ? formatCompactBudgetLabel(portfolio.stats.startingBudget)
            : null
        }
        emptyMessage={`${view.type} — no published projects yet.`}
      />
    </section>
  );
}

function clientNoteAvatarUrl(
  portfolio: PublicPortfolioResponse,
  author: string | null,
): string | null {
  if (!author) return null;
  const authorTokens = new Set(
    author
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((token) => token.length > 1),
  );
  return (
    portfolio.reviews.find((review) => {
      if (!review.avatarUrl) return false;
      const reviewTokens = review.author
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((token) => token.length > 1);
      return reviewTokens.some((token) => authorTokens.has(token));
    })?.avatarUrl ?? null
  );
}

function ClientNoteAvatar({ author, avatarUrl }: { author: string; avatarUrl: string | null }) {
  if (avatarUrl) {
    return (
      <Image
        src={avatarUrl}
        alt=""
        width={40}
        height={40}
        unoptimized
        className="profile-note-avatar"
      />
    );
  }
  return <span className="profile-note-avatar">{studioInitials(author)}</span>;
}

function StorySection({ portfolio }: SectionProps) {
  const testimonial = portfolio.testimonial;
  const quote = testimonial?.words ?? portfolio.tagline ?? portfolio.bio;
  if (!quote) return null;
  const isClientNote = Boolean(testimonial);
  const noteMeta = [isClientNote ? 'Client note' : 'Studio note', testimonial?.projectTitle]
    .filter(Boolean)
    .join(' · ');
  const author = testimonial?.author ?? portfolio.displayName;
  const authorMeta = isClientNote
    ? [testimonial?.projectTitle, 'Homeowner'].filter(Boolean).join(' · ')
    : 'Published portfolio';
  const avatarUrl = isClientNote ? clientNoteAvatarUrl(portfolio, author) : null;
  return (
    <section aria-label="Client note" className="profile-shell">
      <div className="profile-story">
        <p className="profile-story-pill">
          <span aria-hidden="true" />
          {noteMeta}
        </p>
        <ProfileTestimonialQuote quote={quote} />
        {author ? (
          <footer className="profile-story-author">
            <ClientNoteAvatar author={author} avatarUrl={avatarUrl} />
            <div>
              <p>{author}</p>
              {authorMeta ? (
                <span>
                  {isClientNote ? <BadgeCheck aria-hidden="true" className="size-3" /> : null}
                  {authorMeta}
                </span>
              ) : null}
            </div>
          </footer>
        ) : null}
      </div>
    </section>
  );
}

function hasGoogleClientRatings(portfolio: PublicPortfolioResponse) {
  return (
    (portfolio.reviewVisibility.google.reviews &&
      portfolio.reviews.some((review) => review.source === 'google')) ||
    (portfolio.sections.overallRating &&
      portfolio.reviewVisibility.google.overallRating &&
      (portfolio.stats.google?.reviewCount ?? 0) > 0)
  );
}

function ReviewsSection({ portfolio }: SectionProps) {
  const hasRatings = hasGoogleClientRatings(portfolio);
  if (!hasRatings) return null;
  return (
    <section
      id="reviews"
      className="profile-shell profile-section"
      aria-labelledby="client-ratings-heading"
    >
      <ProfileHeading
        id="client-ratings-heading"
        detail={
          <span className="profile-google-sync">
            <GoogleBrandIcon aria-hidden="true" />
            From Google · synced daily
          </span>
        }
      >
        Client ratings
      </ProfileHeading>
      <ProfileClientRatings portfolio={portfolio} />
    </section>
  );
}

function ExperienceCentersSection({ portfolio, view }: SectionProps) {
  const centres = (portfolio.experienceCenterGroups ?? []).flatMap((group) => group.centers);
  if (centres.length === 0) return null;
  const cities = new Set(centres.map((centre) => centre.city));
  return (
    <section
      aria-labelledby="experience-centers-heading"
      id="centres"
      className="profile-shell profile-section"
    >
      <ProfileHeading
        id="experience-centers-heading"
        detail={`${centres.length} ${centres.length === 1 ? 'centre' : 'centres'} · ${cities.size} ${cities.size === 1 ? 'city' : 'cities'}`}
      >
        Experience centres
      </ProfileHeading>
      <ProfileExperienceCentres
        centres={centres}
        portfolio={portfolio}
        loginHref={view.loginHref}
      />
    </section>
  );
}

function ShareSection({ portfolio, view }: SectionProps) {
  const rating = portfolio.sections.overallRating ? headlineReviewAggregate(portfolio.stats) : null;
  const projectImages = portfolio.projects.projects
    .map((project) => project.coverImageUrl)
    .filter((url): url is string => Boolean(url))
    .slice(0, 3);
  const budgetLabel = portfolio.stats.startingBudget
    ? formatCompactBudgetLabel(portfolio.stats.startingBudget)
    : null;
  const socialLinks = portfolioSocialLinks(portfolio);
  const shareFacts: Array<{ value: string; label: string; icon?: ReactNode }> = [];
  if (rating) {
    shareFacts.push({
      value: formatRating(rating.rating),
      label: `${rating.reviewCount} ${rating.source === 'google' ? 'Google reviews' : 'reviews'}`,
      icon: <Star aria-hidden="true" className="profile-share-rating-star" />,
    });
  }
  shareFacts.push({ value: String(portfolio.stats.projectCount), label: 'Projects on tickif' });
  if (portfolio.stats.yearsExperience != null) {
    shareFacts.push({
      value: `${portfolio.stats.yearsExperience} yrs`,
      label: portfolio.foundedYear != null ? `Since ${portfolio.foundedYear}` : 'Studio experience',
    });
  }
  const fitItems = [budgetLabel ? `Projects from ${budgetLabel}` : null, view.location].filter(
    (item): item is string => Boolean(item),
  );
  return (
    <section id="share" className="profile-shell profile-section">
      <div className="profile-share">
        <Card className="profile-share-card" aria-label={`${portfolio.displayName} preview card`}>
          {projectImages.length > 0 ? (
            <div className="profile-share-strip">
              {projectImages.map((imageUrl, index) => (
                <div key={`${imageUrl}-${index}`} className="profile-share-strip-image">
                  <Image
                    src={imageUrl}
                    alt=""
                    fill
                    unoptimized
                    sizes="(min-width: 768px) 180px, 30vw"
                    className="object-cover"
                  />
                  {index === 2 && portfolio.stats.projectCount > projectImages.length ? (
                    <span>+{portfolio.stats.projectCount - projectImages.length}</span>
                  ) : null}
                </div>
              ))}
            </div>
          ) : portfolio.heroCoverUrl ? (
            <div className="profile-share-strip">
              <div className="profile-share-strip-image">
                <Image
                  src={portfolio.heroCoverUrl}
                  alt=""
                  fill
                  unoptimized
                  sizes="(min-width: 768px) 440px, 80vw"
                  className="object-cover"
                />
              </div>
            </div>
          ) : null}
          <div className="profile-share-card-body">
            <div className="profile-share-identity">
              <StudioMark
                portfolio={portfolio}
                view={view}
                className="profile-share-avatar"
                sizePx={40}
              />
              <div className="min-w-0">
                <p>
                  {portfolio.displayName}
                  {portfolio.sections.tickifBadge && portfolio.isKycVerified ? (
                    <BadgeCheck aria-label="Verified studio" className="profile-share-check" />
                  ) : null}
                </p>
                <span>
                  {view.type}
                  {view.location ? ` · ${view.location}` : ''}
                </span>
              </div>
            </div>
            {shareFacts.length > 0 ? (
              <dl className="profile-share-stats">
                {shareFacts.map((fact) => (
                  <div key={fact.label}>
                    <dt>{fact.label}</dt>
                    <dd>
                      {fact.icon}
                      {fact.value}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : null}
            {fitItems.length > 0 ? (
              <p className="profile-share-fit">
                {fitItems.map((item, index) => (
                  <span key={item}>
                    {index > 0 ? <i aria-hidden="true">·</i> : null}
                    {item}
                  </span>
                ))}
              </p>
            ) : null}
            {portfolio.sections.tickifBadge && portfolio.isKycVerified ? (
              <div className="profile-share-verified">
                <BadgeCheck aria-hidden="true" />
                <span>Verified on Tickif</span>
              </div>
            ) : null}
          </div>
        </Card>
        <div className="profile-share-copy">
          <p className="profile-share-pill">
            <span aria-hidden="true" />
            One link. Everywhere.
          </p>
          <h2 className="profile-share-title">
            A portfolio worth <span>sharing.</span>
          </h2>
          <p className="profile-share-description">
            Every project, review and recognition in one verified link. Send it to a homeowner, or
            add it to your Instagram bio.
          </p>
          <div className="profile-share-actions">
            <div className="profile-share-link-box">
              <span>{view.publicProfileLabel}</span>
              <CopyLinkButton
                value={view.publicProfileHref}
                variant="default"
                label="Copy link"
                icon="copy"
                className="profile-share-copy-button"
              />
            </div>
            <FollowDesignerButton
              designerProfileId={portfolio.profileId}
              designerName={portfolio.displayName}
              loginHref={view.loginHref}
              size="lg"
              className="h-11.5"
            />
            <EnquiryCta
              context={{
                type: 'designer',
                designerName: portfolio.displayName,
                designerLocation: view.location,
                designerLogoUrl: portfolio.logoUrl,
              }}
              designerProfileId={portfolio.profileId}
              loginHref={view.loginHref}
              variant="emphasis"
              ariaLabel="Enquire"
              className="profile-share-enquire"
            >
              <span>Enquire</span>
              <span className="profile-share-enquire-icon" aria-hidden="true">
                <ArrowRight className="size-4" />
              </span>
            </EnquiryCta>
          </div>
          {socialLinks.length > 0 ? (
            <div className="profile-share-socials">
              <p>Find {portfolio.displayName} on</p>
              <div>
                {socialLinks.map((link) => (
                  <a
                    key={link.key}
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                  >
                    <span className="profile-share-social-icon">{link.icon}</span>
                    <span>{link.label}</span>
                    {link.meta ? <small>{link.meta}</small> : null}
                    <ExternalLink aria-hidden="true" />
                  </a>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function ConsultationSection({ portfolio, view }: SectionProps) {
  return (
    <section id="enquire" className="profile-consultation">
      <div className="profile-shell profile-consultation-inner">
        <div className="profile-consultation-copy">
          <p className="profile-consultation-pill">
            <span aria-hidden="true" />
            Enquire directly · No middlemen
          </p>
          <h2
            className="profile-consultation-title"
            aria-label="Let's build something you can't imagine living without."
          >
            <span>Let&apos;s build something</span>
            <span>you can&apos;t imagine</span>
            <span>
              <mark>living without.</mark>
            </span>
          </h2>
        </div>
        <div className="profile-consultation-side">
          <div className="profile-consultation-person">
            <StudioMark
              portfolio={portfolio}
              view={view}
              className="profile-consultation-avatar"
              sizePx={56}
            />
            <div>
              <p>{portfolio.displayName}</p>
              <span>{view.type}</span>
            </div>
          </div>
          <p>
            Share your rooms, budget and timeline with {portfolio.displayName}. Enquiring is free,
            with no obligation.
          </p>
          <ConsultationCta
            designerProfileId={portfolio.profileId}
            designerName={portfolio.displayName}
            loginHref={view.loginHref}
            className="profile-consultation-enquire"
          />
        </div>
      </div>
    </section>
  );
}

function ProfileNavigation({ portfolio, view }: SectionProps) {
  const hasWork =
    portfolio.stats.projectCount > 0 ||
    portfolio.projects.projects.length > 0 ||
    portfolio.projects.hasMore;
  const rating = portfolio.sections.overallRating ? headlineReviewAggregate(portfolio.stats) : null;
  const hasReviews = hasGoogleClientRatings(portfolio);
  const hasCentres = portfolio.experienceCenterGroups?.some((group) => group.centers.length > 0);
  const navDetails = [view.type, rating ? `★ ${formatRating(rating.rating)}` : null, view.location]
    .filter(Boolean)
    .join(' · ');
  const tickerItems = [
    'Discover design studios',
    'Free to browse',
    'No middlemen',
    [portfolio.displayName, view.location].filter(Boolean).join(' · '),
    rating ? `★ ${formatRating(rating.rating)} from ${rating.reviewCount} reviews` : null,
  ].filter((item): item is string => Boolean(item));
  return (
    <header className="profile-navigation">
      <div className="profile-navigation-band" aria-label="Tickif portfolio highlights">
        <div className="profile-navigation-ticker">
          {[0, 1, 2].map((loop) => (
            <span key={loop} className="profile-navigation-ticker-set" aria-hidden={loop > 0}>
              {tickerItems.map((item) => (
                <span key={`${loop}-${item}`}>{item}</span>
              ))}
            </span>
          ))}
        </div>
      </div>
      <div className="profile-shell profile-navigation-inner">
        <a
          href="#profile-top"
          className="profile-nav-brand"
          aria-label={`${portfolio.displayName} portfolio`}
        >
          <StudioMark
            portfolio={portfolio}
            view={view}
            className="profile-nav-avatar text-sm"
            sizePx={36}
          />
          <div className="profile-nav-brand-copy">
            <p className="profile-nav-name">
              <span className="truncate">{portfolio.displayName}</span>
              {portfolio.sections.tickifBadge && portfolio.isKycVerified ? (
                <BadgeCheck
                  aria-label={portfolio.isKycVerified ? 'Verified studio' : undefined}
                  aria-hidden={portfolio.isKycVerified ? undefined : true}
                  className="profile-nav-verified size-3.5 shrink-0 fill-primary text-primary-foreground"
                />
              ) : null}
            </p>
            {navDetails ? <p className="profile-nav-meta">{navDetails}</p> : null}
          </div>
        </a>
        <div className="profile-nav-actions">
          <nav aria-label="Portfolio sections" className="profile-nav-links">
            {hasWork ? <a href="#work">Work</a> : null}
            {portfolio.sections.trustCredentials && portfolio.badges.length > 0 ? (
              <a href="#recognition">Recognition</a>
            ) : null}
            {hasReviews ? <a href="#reviews">Reviews</a> : null}
            {hasCentres ? <a href="#centres">Centres</a> : null}
          </nav>
          {portfolio.sections.shareBlock ? (
            <CopyLinkButton
              value={view.publicProfileHref}
              label="Share"
              icon="share"
              variant="outline"
              ariaLabel="Share profile"
              className="profile-nav-share h-9 px-4 text-xs"
            />
          ) : null}
          <EnquiryCta
            context={{ type: 'designer', designerName: portfolio.displayName }}
            designerProfileId={portfolio.profileId}
            loginHref={view.loginHref}
            variant="emphasis"
            ariaLabel="Enquire about this studio"
            className="profile-nav-enquiry h-10 text-xs"
          >
            <span>Send an enquiry</span>
            <span className="profile-nav-enquiry-icon" aria-hidden="true">
              <ArrowRight className="size-3.5" />
            </span>
          </EnquiryCta>
        </div>
      </div>
    </header>
  );
}

function ProfileFooter({ portfolio, view }: SectionProps) {
  const links = portfolioSocialLinks(portfolio);
  const rating = portfolio.sections.overallRating ? headlineReviewAggregate(portfolio.stats) : null;
  const centreCount =
    portfolio.experienceCenterGroups?.reduce((sum, group) => sum + group.centers.length, 0) ?? 0;
  const footerIntro =
    portfolio.tagline?.trim() || `${portfolio.displayName}'s verified public portfolio.`;
  return (
    <footer className="profile-footer">
      <div className="profile-footer-grid">
        <div className="profile-footer-brand">
          <div className="profile-footer-identity">
            <StudioMark
              portfolio={portfolio}
              view={view}
              className="profile-footer-avatar"
              sizePx={40}
            />
            <div>
              <p>
                {portfolio.displayName}
                {portfolio.sections.tickifBadge && portfolio.isKycVerified ? (
                  <BadgeCheck aria-hidden="true" className="profile-footer-check" />
                ) : null}
              </p>
              <span>
                {view.type}
                {view.location ? ` · ${view.location}` : ''}
              </span>
            </div>
          </div>
          <p className="profile-footer-intro">{footerIntro}</p>
          <EnquiryCta
            context={{
              type: 'designer',
              designerName: portfolio.displayName,
              designerLocation: view.location,
              designerLogoUrl: portfolio.logoUrl,
            }}
            designerProfileId={portfolio.profileId}
            loginHref={view.loginHref}
            variant="emphasis"
            ariaLabel="Footer enquiry"
            className="profile-footer-enquire"
          >
            <span>Enquire</span>
            <span aria-hidden="true">
              <ArrowRight className="size-3.5" />
            </span>
          </EnquiryCta>
        </div>

        <nav aria-label="Footer portfolio links" className="profile-footer-links">
          <p>Portfolio</p>
          <ul>
            {portfolio.stats.projectCount > 0 ? (
              <li>
                <a href="#work">
                  <span>Projects</span>
                  <small>{portfolio.stats.projectCount}</small>
                </a>
              </li>
            ) : null}
            {portfolio.sections.trustCredentials && portfolio.badges.length > 0 ? (
              <li>
                <a href="#recognition">
                  <span>Recognition</span>
                  <small>{portfolio.badges.length}</small>
                </a>
              </li>
            ) : null}
            {rating ? (
              <li>
                <a href="#reviews">
                  <span>Ratings</span>
                  <small>{formatRating(rating.rating)}</small>
                </a>
              </li>
            ) : null}
          </ul>
        </nav>

        <nav aria-label="Footer studio actions" className="profile-footer-links">
          <p>Studio</p>
          <ul>
            {centreCount > 0 ? (
              <li>
                <a href="#centres">
                  <span>Experience centres</span>
                  <small>{centreCount}</small>
                </a>
              </li>
            ) : null}
            <li>
              <EnquiryCta
                context={{ type: 'designer', designerName: portfolio.displayName }}
                designerProfileId={portfolio.profileId}
                loginHref={view.loginHref}
                variant="link"
                ariaLabel="Send enquiry"
                className="profile-footer-action"
              >
                <span>Send an enquiry</span>
              </EnquiryCta>
            </li>
          </ul>
        </nav>

        {links.length > 0 ? (
          <nav aria-label="Footer social links" className="profile-footer-links">
            <p>Elsewhere</p>
            <ul>
              {links.map((link) => (
                <li key={link.label}>
                  <a href={link.href} target="_blank" rel="noopener noreferrer nofollow">
                    <span>{link.label}</span>
                    <span aria-hidden="true">
                      <ArrowRight className="size-3" />
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
      </div>
      <p className="profile-footer-outline" aria-hidden="true">
        {portfolio.displayName}
      </p>
      <div className="profile-footer-bottom">
        <p>
          <span>Portfolio by</span>
          <a href="/" aria-label="Tickif home">
            <TickifBrandLogo tone="inverse" />
          </a>
          <span>· Published on Tickif</span>
        </p>
        <a href="#profile-top">Back to top ↑</a>
      </div>
    </footer>
  );
}

export function PublicDesignerProfile({
  portfolio,
  tickifReviews,
}: {
  portfolio: PublicPortfolioResponse;
  tickifReviews?: ReactNode;
}) {
  const projects = portfolio.projects.projects;
  const canonical = new URL(portfolio.canonicalUrl);

  const view: ProfileView = {
    initials: studioInitials(portfolio.displayName),
    type: studioType(portfolio),
    location: studioLocation(portfolio, projects),
    pitch: strapline(portfolio),
    publicProfileHref: portfolio.canonicalUrl,
    publicProfileLabel: `${canonical.host}${canonical.pathname}`,
    loginHref: `/login?callbackURL=${encodeURIComponent(canonical.pathname)}`,
  };

  const props: SectionProps = { portfolio, view };

  return (
    <FollowDesignerProvider designerProfileId={portfolio.profileId}>
      <EnquiryAvailabilityProvider designerProfileId={portfolio.profileId}>
        <main
          id="profile-top"
          className="designer-profile min-h-screen bg-background text-foreground"
          style={portfolioAccentStyle(portfolio.accentColor)}
        >
          <ProfileMotion />
          <ProfileNavigation {...props} />
          {portfolio.sections.hero ? <HeroSection {...props} /> : <StudioBar {...props} />}
          {portfolio.sections.trustCredentials && portfolio.badges.length > 0 ? (
            <CredentialsSection {...props} />
          ) : null}
          <PortfolioSection {...props} />
          {portfolio.sections.featuredTestimonial ? <StorySection {...props} /> : null}
          <ReviewsSection {...props} />
          {tickifReviews}
          <ExperienceCentersSection {...props} />
          {portfolio.sections.shareBlock ? <ShareSection {...props} /> : null}
          <ConsultationSection {...props} />
          <ProfileFooter {...props} />
          <ProfileFloatingEnquiry
            designerProfileId={portfolio.profileId}
            designerName={portfolio.displayName}
            logoUrl={portfolio.logoUrl}
            initials={view.initials}
            loginHref={view.loginHref}
          />
        </main>
      </EnquiryAvailabilityProvider>
    </FollowDesignerProvider>
  );
}
