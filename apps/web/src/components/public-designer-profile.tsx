import Image from 'next/image';
import './public-designer-profile.css';
import { ProfileFloatingEnquiry } from '@/components/profile-floating-enquiry';
import { ProfileMotion } from '@/components/profile-motion';
import { profileSealLetterLayout } from '@/components/profile-seal-letter-layout';
import { DesignerLogoAvatar } from '@/components/designer-logo-avatar';
import { TickifBrandLogo } from '@/components/tickif-brand-logo';
import { portfolioAccentStyle } from '@/lib/portfolio-accent';
import { portfolioShareFacts } from '@/lib/portfolio-share-card';
import { portfolioRecognitionArtwork } from '@/lib/portfolio-recognition';
import type { ReactNode } from 'react';
import { ArrowRight, BadgeCheck, Check, MessageSquare, Star } from 'lucide-react';
import {
  PORTFOLIO_BADGE_PRESENTATION,
  type PublicPortfolioResponse,
  type PublicPortfolioStats,
} from '@repo/contracts';
import { Badge } from '@repo/ui/components/badge';
import { Card } from '@repo/ui/components/card';
import { RecognitionBadge } from '@repo/ui/components/recognition-badge';
import { CopyLinkButton } from '@/components/copy-link-button';
import { EnquiryAvailabilityProvider, EnquiryCta } from '@/components/enquiry-cta';
import { ConsultationCta } from '@/components/consultation-cta';
import { PublicProjectGallery } from '@/components/public-project-gallery';
import { ProfileClientRatings } from '@/components/profile-client-ratings';
import { ProfileExperienceCentres } from '@/components/profile-experience-centres';
import { formatCompactBudgetLabel } from '@/lib/format-budget-label';
import {
  formatRating,
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
                  aria-label="Verified studio"
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
type HeroStatTile = { value: string; label: string; detail: string };

function ProfileTicket({
  portfolio,
  share = false,
}: {
  portfolio: PublicPortfolioResponse;
  share?: boolean;
}) {
  return (
    <span className="profile-ticket">
      <span>TICKIF</span>
      <i aria-hidden="true" />
      <span>
        {portfolio.sections.tickifBadge && portfolio.isKycVerified
          ? share
            ? 'Verified'
            : 'KYC verified'
          : 'Portfolio'}
      </span>
    </span>
  );
}

/** Intrinsic SVG dimensions are retained; each layer is a separate Figma export. */
function ProfileArtwork({
  name,
  className,
  accent = false,
}: {
  name: string;
  className?: string;
  accent?: boolean;
}) {
  const src = `/ui/profile/${name}`;
  if (accent) {
    return (
      <span
        className={`profile-accent-artwork ${className ?? ''}`}
        style={{ maskImage: `url("${src}")` }}
        aria-hidden="true"
      >
        <img src={src} alt="" className="invisible block max-w-none" />
      </span>
    );
  }
  // Exact decorative SVGs retain their fractional intrinsic root dimensions.
  return (
    <img
      src={`/ui/profile/${name}`}
      alt=""
      aria-hidden="true"
      className={`max-w-none ${className ?? ''}`}
    />
  );
}

const sealStyles = {
  verified: { start: 0, color: 'var(--profile-seal-verified)', letters: 'verified', value: '✓' },
  established: {
    start: 3,
    color: 'var(--profile-seal-established)',
    letters: 'established',
    value: '',
  },
  'top-performer': {
    start: 6,
    color: 'var(--profile-seal-performer)',
    letters: 'performer',
    value: '★',
  },
  'projects-published': {
    start: 9,
    color: 'var(--profile-seal-projects)',
    letters: 'projects',
    value: '',
  },
} as const;

function HeroIdentityCard({ portfolio, view }: SectionProps) {
  const rating = portfolio.sections.overallRating ? headlineReviewAggregate(portfolio.stats) : null;
  const project = portfolio.projects.projects.find((item) => item.coverImageUrl);
  const seals = portfolio.sections.trustCredentials
    ? portfolio.badges.filter(
        (badge): badge is keyof typeof sealStyles =>
          badge in sealStyles && (badge !== 'verified' || portfolio.isKycVerified),
      )
    : [];
  const orbitText = [
    [
      portfolio.sections.tickifBadge && portfolio.isKycVerified
        ? 'VERIFIED ON TICKIF'
        : 'ON TICKIF',
      `${portfolio.stats.projectCount} PROJECTS`,
    ],
    [
      portfolio.foundedYear != null ? `EST ${portfolio.foundedYear}` : null,
      rating ? `★ ${formatRating(rating.rating)} FROM ${rating.reviewCount} REVIEWS` : null,
      view.location?.toUpperCase(),
    ],
  ].map((facts) => facts.filter(Boolean).join(' · '));
  return (
    <div className="profile-identity-wrap">
      <svg
        className="profile-identity-orbit"
        width="530"
        height="530"
        viewBox="0 0 530 530"
        aria-hidden="true"
      >
        <defs>
          {/* Exact vector path from Figma text-path node 15888:6643. */}
          <path
            id="profile-identity-curve"
            d="M 515 230 C 515 357.0254876708984 399.7133177185059 460 257.5 460 C 115.28668228149414 460 0 357.0254876708984 0 230 C 0 102.97451232910156 115.28668228149414 0 257.5 0 C 399.7133177185059 0 515 102.97451232910156 515 230 Z"
          />
        </defs>
        <g className="profile-orbit-rotor">
          <text transform="translate(15.319378852844238 32.999900817871094)">
            {/* Arc-length equivalent of source segment 1, position 0.610914409160614. */}
            <textPath href="#profile-identity-curve" startOffset="40.637057536046775%">
              {orbitText[0]}
            </textPath>
          </text>
          {orbitText[1] ? (
            <text transform="translate(15.319378852844238 32.999900817871094) rotate(180 257.5 230)">
              <textPath href="#profile-identity-curve" startOffset="40.637057536046775%">
                {orbitText[1]}
              </textPath>
            </text>
          ) : null}
        </g>
      </svg>
      <Card className="profile-identity-card">
        <div className="profile-cover">
          <Image
            src={portfolio.heroCoverUrl!}
            alt={`${portfolio.displayName} portfolio cover`}
            fill
            priority
            loading="eager"
            unoptimized
            sizes="(min-width: 768px) 362px, calc(100vw - 84px)"
            className="object-cover"
          />
        </div>
        {project?.coverImageUrl ? (
          <div className="profile-detail-photo">
            <Image
              src={project.coverImageUrl}
              alt={`${project.title} project detail`}
              fill
              unoptimized
              loading="eager"
              sizes="(min-width: 768px) 362px, calc(100vw - 84px)"
              className="object-cover"
            />
          </div>
        ) : null}
        <p className="profile-card-name profile-highlight flex items-center gap-2">
          <span className="min-w-0 break-words">Selected work</span>
          {portfolio.sections.tickifBadge && portfolio.isKycVerified ? (
            <BadgeCheck
              aria-label="Verified studio"
              className="size-4 shrink-0 fill-primary text-primary-foreground"
            />
          ) : null}
        </p>
        <p className="profile-card-type profile-highlight">{view.type}</p>
        {seals.length > 0 ? (
          <ul aria-label="Studio recognition" className="profile-seals">
            {seals.map((badge) => {
              const seal = sealStyles[badge];
              const value =
                badge === 'established'
                  ? String(portfolio.stats.yearsExperience ?? '')
                  : badge === 'projects-published'
                    ? String(portfolio.stats.projectCount)
                    : seal.value;
              const [upper, lower] = profileSealLetterLayout[seal.letters];
              const caption =
                badge === 'established'
                  ? portfolio.foundedYear != null
                    ? `SINCE ${portfolio.foundedYear}`
                    : 'ON TICKIF'
                  : badge === 'top-performer'
                    ? ' ONTICKIF '
                    : lower.map((letter) => letter.letter).join('');
              return (
                <li
                  key={badge}
                  className={`profile-seal profile-seal-${badge}`}
                  style={{ color: seal.color }}
                >
                  <span className="sr-only">{PORTFOLIO_BADGE_PRESENTATION[badge].label}</span>
                  {[0, 1, 2].map((offset) => (
                    <ProfileArtwork
                      key={offset}
                      name={`hero-vector${seal.start + offset || ''}.svg`}
                      className="profile-seal-layer"
                      accent={badge === 'projects-published'}
                    />
                  ))}
                  <svg className="profile-seal-text" viewBox="0 0 65 65" aria-hidden="true">
                    <defs>
                      <path id={`seal-${badge}-top`} d="M 12 32.5 A 20.5 20.5 0 0 1 53 32.5" />
                      <path id={`seal-${badge}-bottom`} d="M 8.5 32.5 A 24 24 0 0 0 56.5 32.5" />
                    </defs>
                    <text textAnchor="middle">
                      <textPath href={`#seal-${badge}-top`} startOffset="50%">
                        {upper.map((letter) => letter.letter).join('')}
                      </textPath>
                    </text>
                    <text textAnchor="middle">
                      <textPath href={`#seal-${badge}-bottom`} startOffset="50%">
                        {caption.trim()}
                      </textPath>
                    </text>
                  </svg>
                  <span aria-hidden="true" className="profile-seal-value">
                    {value}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : null}
        <div className="profile-card-footer">
          <ProfileTicket portfolio={portfolio} />
          {rating ? (
            <div className="text-right">
              <span className="inline-flex items-center gap-1 text-sm">
                <Star aria-hidden="true" className="size-3 fill-current" />
                {formatRating(rating.rating)}
              </span>
              <p className="mt-1 font-mono text-2xs uppercase tracking-widest text-muted-foreground">
                {rating.reviewCount} reviews
              </p>
            </div>
          ) : null}
        </div>
      </Card>
      {portfolio.sections.shareBlock ? (
        <div className="mt-8 flex justify-center">
          <CopyLinkButton
            value={view.publicProfileHref}
            label="Share this card"
            icon="share"
            variant="outline"
            className="bg-muted text-[13px]"
          />
        </div>
      ) : null}
    </div>
  );
}

function HeroSection({ portfolio, view }: SectionProps) {
  const { stats } = portfolio;
  const rating = portfolio.sections.overallRating ? headlineReviewAggregate(stats) : null;
  const tiles: HeroStatTile[] = [
    ...(rating
      ? [
          {
            value: formatRating(rating.rating),
            label: 'Rating',
            detail: `${rating.reviewCount} ${rating.source === 'tickif' ? 'Tickif' : 'Google'} reviews`,
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
            value: String(portfolio.foundedYear),
            label: 'Established',
            detail:
              stats.yearsExperience != null
                ? `${stats.yearsExperience} years experience`
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
  ];

  return (
    <section aria-label="Portfolio hero" className="profile-hero">
      <div className={`profile-shell ${portfolio.heroCoverUrl ? 'profile-hero-grid' : ''}`}>
        <div className="profile-hero-copy">
          {view.location ? (
            <Badge variant="secondary" className="font-mono text-xs uppercase tracking-widest">
              {view.location}
            </Badge>
          ) : null}
          <div className="flex min-w-0 items-center gap-3.5">
            <StudioMark
              portfolio={portfolio}
              view={view}
              className="size-16 rounded-xl text-3xl shadow-card"
              sizePx={64}
            />
            <div className="min-w-0">
              {portfolio.isKycVerified ? (
                <p className="mb-1 inline-flex items-center gap-1 font-mono text-metadata uppercase text-foreground">
                  <Check aria-hidden="true" className="size-3 text-primary" />
                  Verified studio
                </p>
              ) : null}
              <p className="font-mono text-metadata uppercase text-muted-foreground">
                {view.type}
                {portfolio.foundedYear != null ? ` · Est. ${portfolio.foundedYear}` : ''}
              </p>
            </div>
          </div>

          <h1 className="profile-hero-title" aria-label={portfolio.displayName}>
            <StudioName name={portfolio.displayName} />
            <span aria-hidden="true" className="profile-punctuation">
              .
            </span>
          </h1>
          {view.pitch ? (
            <p className="max-w-125 text-base leading-relaxed text-foreground-secondary sm:text-lg">
              {view.pitch}
            </p>
          ) : null}

          <dl className="profile-proof-grid">
            {tiles.map((tile) => (
              <div key={tile.label}>
                <dt>{tile.label}</dt>
                <dd aria-label={tile.value}>
                  <span aria-hidden="true" data-profile-count={tile.label}>
                    {tile.value}
                  </span>
                </dd>
                <p>{tile.detail}</p>
              </div>
            ))}
            <ProfileArtwork
              name="hero-vertical-divider1.png"
              className="profile-proof-divider left-0"
            />
            <ProfileArtwork
              name="hero-vertical-divider.png"
              className="profile-proof-divider left-1/2"
            />
            <ProfileArtwork
              name="hero-vertical-divider1.png"
              className="profile-proof-divider right-0"
            />
            <span className="profile-proof-junction" aria-hidden="true" />
          </dl>

          <div className="flex flex-wrap items-center gap-3">
            <EnquiryCta
              context={{
                type: 'designer',
                designerName: portfolio.displayName,
                designerLocation: view.location,
                designerLogoUrl: portfolio.logoUrl,
              }}
              designerProfileId={portfolio.profileId}
              loginHref={view.loginHref}
              variant="default"
              ariaLabel="Enquire"
              className="h-12 px-6 shadow-button-primary"
            >
              <MessageSquare className="size-4" />
              Enquire
            </EnquiryCta>
          </div>
        </div>
        {portfolio.heroCoverUrl ? <HeroIdentityCard portfolio={portfolio} view={view} /> : null}
      </div>
    </section>
  );
}

function StudioName({ name }: { name: string }) {
  const space = name.indexOf(' ');
  return space > 0 ? (
    <>
      {name.slice(0, space)} <span className="profile-highlight">{name.slice(space + 1)}</span>
    </>
  ) : (
    <>{name}</>
  );
}

function ProfileHeading({
  number,
  children,
  id,
  detail,
}: {
  number: string;
  children: ReactNode;
  id: string;
  detail?: ReactNode;
}) {
  return (
    <header className="profile-section-header">
      <h2 id={id} className="profile-heading">
        <span className="profile-section-number" aria-hidden="true">
          {number}
        </span>
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
  return (
    <section
      id="recognition"
      aria-labelledby="recognition-heading"
      className="profile-shell profile-section"
    >
      <ProfileHeading id="recognition-heading" number="01" detail="Earned through real work">
        Recognition on Tickif
      </ProfileHeading>
      <ul className="profile-recognition-list">
        {portfolio.badges.map((badge) => {
          const { label, criterion } = PORTFOLIO_BADGE_PRESENTATION[badge];
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
                eyebrow="Tickif"
                label={label}
                detail={detail}
                description={criterion}
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
      <ProfileHeading
        id="projects-heading"
        number="02"
        detail={`${portfolio.stats.projectCount} published`}
      >
        Selected projects
      </ProfileHeading>
      <PublicProjectGallery
        profileId={portfolio.profileId}
        initialPage={portfolio.projects}
        studioName={portfolio.displayName}
        emptyMessage={`${view.type} — no published projects yet.`}
      />
    </section>
  );
}

function StorySection({ portfolio }: SectionProps) {
  const testimonial = portfolio.testimonial;
  if (!testimonial) return null;
  return (
    <section aria-label="Client note" className="profile-shell">
      <div className="profile-story">
        <span aria-hidden="true" className="profile-story-corner left-0 top-0 border-l border-t" />
        <span aria-hidden="true" className="profile-story-corner right-0 top-0 border-r border-t" />
        <span
          aria-hidden="true"
          className="profile-story-corner bottom-0 left-0 border-b border-l"
        />
        <span
          aria-hidden="true"
          className="profile-story-corner bottom-0 right-0 border-b border-r"
        />
        <p className="font-mono text-metadata tracking-widest text-muted-foreground uppercase">
          Client note{testimonial.projectTitle ? ` · ${testimonial.projectTitle}` : ''}
        </p>
        <blockquote>
          <span aria-hidden="true" className="profile-punctuation">
            “
          </span>
          {testimonial.words}
          <span aria-hidden="true" className="profile-punctuation">
            ”
          </span>
        </blockquote>
        {testimonial.author ? (
          <footer className="flex items-center justify-center gap-3 pt-1 text-left">
            <span className="profile-note-avatar grid size-8 shrink-0 place-items-center rounded-full text-xs font-semibold">
              {studioInitials(testimonial.author)}
            </span>
            <div>
              <p className="text-sm font-medium">{testimonial.author}</p>
              <p className="text-xs text-muted-foreground">
                {testimonial.projectTitle ?? 'Homeowner'}
              </p>
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
  if (!hasGoogleClientRatings(portfolio)) return null;
  return (
    <section
      id="reviews"
      className="profile-shell profile-section"
      aria-labelledby="client-ratings-heading"
    >
      <ProfileHeading id="client-ratings-heading" number="03">
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
        number="04"
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
  const facts = portfolioShareFacts(portfolio);
  return (
    <section id="share" className="profile-shell profile-section">
      <div className="profile-share">
        <Card className="profile-share-card">
          <div className="flex items-center gap-3">
            <StudioMark
              portfolio={portfolio}
              view={view}
              className="size-11 rounded-lg text-sm"
              sizePx={44}
            />
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 font-display text-lg font-bold">
                {portfolio.displayName}
                {portfolio.sections.tickifBadge && portfolio.isKycVerified ? (
                  <BadgeCheck
                    aria-label="Verified studio"
                    className="size-4 shrink-0 fill-primary text-primary-foreground"
                  />
                ) : null}
              </p>
              <p className="mt-1 font-mono text-2xs uppercase tracking-widest text-muted-foreground">
                {view.type}
                {view.location ? ` · ${view.location}` : ''}
              </p>
            </div>
          </div>
          <div className="profile-share-grid">
            <dl className="profile-share-stats">
              {facts.map((fact) => (
                <div key={fact.label}>
                  <dt>{fact.label}</dt>
                  <dd>{fact.value}</dd>
                </div>
              ))}
            </dl>
            {portfolio.heroCoverUrl ? (
              <div className="profile-share-photo">
                <Image
                  src={portfolio.heroCoverUrl}
                  alt={`${portfolio.displayName} portfolio preview`}
                  fill
                  unoptimized
                  sizes="(min-width: 768px) 200px, 250px"
                  className="object-cover"
                />
              </div>
            ) : null}
          </div>
          <div className="profile-card-footer">
            <ProfileTicket portfolio={portfolio} share />
            <span className="break-all font-mono text-2xs text-secondary-foreground">
              {view.publicProfileLabel}
            </span>
          </div>
        </Card>
        <div className="relative min-w-0">
          <p className="profile-highlight font-mono text-xs uppercase tracking-widest">
            One link. Everywhere.
          </p>
          <h2 className="profile-share-title">
            A portfolio <span className="profile-highlight">worth sharing.</span>
          </h2>
          <p className="mt-6 max-w-118 text-base leading-relaxed text-foreground-secondary">
            This is {portfolio.displayName}&apos;s living portfolio — every project, rating and
            detail in one link. Send it on WhatsApp, drop it in your Instagram bio, or print it on a
            card.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
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
              ariaLabel="Send enquiry"
              className="h-12 px-7"
            >
              Send enquiry
            </EnquiryCta>
            <CopyLinkButton
              value={view.publicProfileHref}
              variant="outline"
              className="h-12 bg-muted px-7"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function ConsultationSection({ portfolio, view }: SectionProps) {
  return (
    <section id="enquire" className="profile-consultation">
      <div className="profile-shell profile-consultation-inner">
        <p className="flex items-center gap-3 font-mono text-xs uppercase tracking-widest text-primary-soft">
          <span className="size-2 rounded-full bg-primary" aria-hidden="true" />
          Direct line to the designer
        </p>
        <h2
          className="profile-consultation-title"
          aria-label="Let's build something you can't imagine living without."
        >
          <span className="block">Let&apos;s build</span>
          <span className="block">
            something <span className="profile-highlight">you</span>
          </span>
          <span className="profile-highlight block">can&apos;t imagine</span>
          <span className="block">
            living without<span className="profile-punctuation">.</span>
          </span>
        </h2>
        <div className="profile-consultation-bottom">
          <p className="max-w-104 text-lg leading-relaxed text-surface-inverse-foreground/80">
            Send an enquiry to {portfolio.displayName} on Tickif and start discussing your project.
          </p>
          <ConsultationCta
            designerProfileId={portfolio.profileId}
            designerName={portfolio.displayName}
            loginHref={view.loginHref}
            className="profile-floating-action h-16 border-0 px-8 text-base"
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
  const hasReviews = hasGoogleClientRatings(portfolio);
  const hasCentres = portfolio.experienceCenterGroups?.some((group) => group.centers.length > 0);
  return (
    <header className="profile-navigation">
      <div className="profile-shell profile-navigation-inner">
        <a
          href="#profile-top"
          className="flex min-w-0 items-center gap-3"
          aria-label={`${portfolio.displayName} portfolio`}
        >
          <StudioMark
            portfolio={portfolio}
            view={view}
            className="size-10 rounded-lg text-sm"
            sizePx={40}
          />
          <div className="min-w-0">
            <p className="truncate text-xs text-muted-foreground">
              {view.type}
              {view.location ? ` · ${view.location}` : ''}
            </p>
          </div>
        </a>
        <div className="flex shrink-0 items-center gap-6">
          <nav aria-label="Portfolio sections" className="profile-nav-links">
            {hasWork ? <a href="#work">Work</a> : null}
            {portfolio.sections.trustCredentials && portfolio.badges.length > 0 ? (
              <a href="#recognition">Recognition</a>
            ) : null}
            {hasReviews ? <a href="#reviews">Reviews</a> : null}
            {hasCentres ? <a href="#centres">Centres</a> : null}
          </nav>
          <EnquiryCta
            context={{ type: 'designer', designerName: portfolio.displayName }}
            designerProfileId={portfolio.profileId}
            loginHref={view.loginHref}
            variant="emphasis"
            ariaLabel="Enquire about this studio"
            className="h-9 px-4 text-xs"
          >
            Enquire <ArrowRight className="size-3" />
          </EnquiryCta>
        </div>
      </div>
    </header>
  );
}

function ProfileFooter({ portfolio, view }: SectionProps) {
  const social = portfolio.social;
  const links = portfolio.sections.socialLinks
    ? [
        social.instagramHandle
          ? { label: 'Instagram', href: socialHref('instagram', social.instagramHandle) }
          : null,
        social.linkedinHandle
          ? { label: 'LinkedIn', href: socialHref('linkedin', social.linkedinHandle) }
          : null,
        social.youtubeHandle
          ? { label: 'YouTube', href: socialHref('youtube', social.youtubeHandle) }
          : null,
        safeExternalHref(social.websiteUrl)
          ? { label: websiteLabel(social.websiteUrl!), href: safeExternalHref(social.websiteUrl)! }
          : null,
      ].filter(
        (link): link is { label: string; href: string } => link !== null && Boolean(link.href),
      )
    : [];
  return (
    <footer className="profile-shell profile-footer">
      <div className="profile-footer-grid">
        <div>
          <div className="flex items-center gap-3">
            <StudioMark
              portfolio={portfolio}
              view={view}
              className="size-10 rounded-lg text-sm"
              sizePx={40}
            />
            <div>
              <p className="font-display font-bold">{portfolio.displayName}</p>
              <p className="text-xs text-muted-foreground">
                {view.type}
                {view.location ? ` · ${view.location}` : ''}
              </p>
            </div>
          </div>
          <p className="mt-4 max-w-95 text-sm leading-relaxed text-foreground-secondary">
            {portfolio.tagline}
          </p>
          <ConsultationCta
            designerProfileId={portfolio.profileId}
            designerName={portfolio.displayName}
            loginHref={view.loginHref}
            className="mt-4 h-9 bg-button-inverted px-5 text-xs text-button-inverted-foreground hover:bg-button-inverted-hover"
          />
        </div>
        <div>
          <p className="mb-4 font-mono text-metadata uppercase text-muted-foreground">Portfolio</p>
          <ul className="space-y-3 text-sm">
            {portfolio.stats.projectCount > 0 ? (
              <li>
                <a href="#work">Projects</a>
              </li>
            ) : null}
            {portfolio.sections.trustCredentials && portfolio.badges.length > 0 ? (
              <li>
                <a href="#recognition">Recognition</a>
              </li>
            ) : null}
            {portfolio.experienceCenterGroups?.some((group) => group.centers.length > 0) ? (
              <li>
                <a href="#centres">Experience centres</a>
              </li>
            ) : null}
          </ul>
        </div>
        {links.length > 0 ? (
          <div>
            <p className="mb-4 font-mono text-metadata uppercase text-muted-foreground">
              Elsewhere
            </p>
            <ul className="space-y-3 text-sm">
              {links.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="flex items-center justify-between gap-3"
                  >
                    {link.label}
                    <span className="text-muted-foreground" aria-hidden="true">
                      ↗
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
      <p className="profile-footer-outline" aria-hidden="true">
        {portfolio.displayName}
      </p>
      <div className="flex flex-wrap items-center justify-between gap-4 border-t pt-6 font-mono text-metadata uppercase text-muted-foreground">
        <p className="flex items-center gap-2">
          Portfolio by{' '}
          <a
            href="/"
            aria-label="Tickif home"
            className="rounded-sm bg-surface-inverse px-2 py-1 font-sans normal-case tracking-normal"
          >
            <TickifBrandLogo tone="inverse" />
          </a>
          <span>· Published studio portfolio</span>
        </p>
        <a href="#profile-top" className="text-foreground">
          Back to top ↑
        </a>
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
  );
}
