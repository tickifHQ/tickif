import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { cache, Suspense } from 'react';
import { createReviewSchema, listPublishedReviewsQuerySchema } from '@repo/contracts';
import { TickifReviewsSection } from '@/components/tickif-reviews-section';
import { PublicDesignerProfile } from '@/components/public-designer-profile';
import { fetchPublicPortfolio } from '@/lib/public-portfolio-api';
import { strapline, studioLocation, studioType } from '@/lib/public-portfolio-view';

type PublicDesignerProfilePageProps = {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ bookingId?: string; reviewsPage?: string }>;
};

/**
 * `generateMetadata` and the page body both need the payload. `cache` dedupes
 * them into a single request per render.
 */
const getPortfolio = cache(fetchPublicPortfolio);

/**
 * Resolve the portfolio, or leave the request via `notFound()` / `redirect()`.
 *
 * Shared by `generateMetadata` and the page so the gate runs before anything is
 * rendered. This route group deliberately has no `loading.tsx`: a Suspense
 * fallback would let Next flush the shell — committing a `200` — before this
 * resolves, downgrading an unpublished portfolio to a soft 404 that crawlers
 * index. See `src/components/route-loading.tsx`.
 */
async function resolvePortfolio(slug: string) {
  const portfolio = await getPortfolio(slug);
  if (!portfolio) {
    notFound();
  }

  // Reached via the org slug while a custom portfolio slug exists — send the
  // visitor (and crawlers) to the canonical URL so link equity lands in one place.
  const canonicalSlug = new URL(portfolio.canonicalUrl).pathname.replace(/^\/d\//, '');
  if (canonicalSlug !== slug) {
    redirect(`/d/${canonicalSlug}`);
  }

  return portfolio;
}

export async function generateMetadata({
  params,
}: PublicDesignerProfilePageProps): Promise<Metadata> {
  const { slug } = await params;
  const portfolio = await resolvePortfolio(slug);

  const location = studioLocation(portfolio, portfolio.projects.projects);
  const description =
    strapline(portfolio) ??
    `Explore verified residential interior design work by ${portfolio.displayName}${
      location ? ` in ${location}` : ''
    }.`;
  const socialTitle = `${portfolio.displayName} — ${studioType(portfolio)}`;
  const canonicalSlug = new URL(portfolio.canonicalUrl).pathname.replace(/^\/d\//, '');
  const socialImageUrl = new URL(
    `/d/${encodeURIComponent(canonicalSlug)}/social-card`,
    portfolio.canonicalUrl,
  ).toString();
  const socialImageAlt = `${portfolio.displayName} interior design portfolio`;

  return {
    title: `${portfolio.displayName} | Tickif`,
    description,
    alternates: { canonical: portfolio.canonicalUrl },
    openGraph: {
      type: 'profile',
      title: socialTitle,
      description,
      url: portfolio.canonicalUrl,
      images: [{ url: socialImageUrl, width: 1200, height: 630, alt: socialImageAlt }],
    },
    twitter: {
      card: 'summary_large_image',
      title: socialTitle,
      description,
      images: [{ url: socialImageUrl, alt: socialImageAlt }],
    },
  };
}

export default async function PublicDesignerProfilePage({
  params,
  searchParams,
}: PublicDesignerProfilePageProps) {
  const { slug } = await params;
  // `generateMetadata` already ran the gate; this is a cache hit that also
  // re-narrows the type for the render.
  const portfolio = await resolvePortfolio(slug);

  const query = await searchParams;
  const booking = createReviewSchema.shape.bookingId.safeParse(query?.bookingId);
  const pagination = listPublishedReviewsQuerySchema.safeParse({
    designerProfileId: portfolio.profileId,
    page: query?.reviewsPage,
  });
  return (
    <PublicDesignerProfile
      portfolio={portfolio}
      tickifReviews={
        <Suspense
          fallback={
            <p role="status" className="p-5">
              Loading Tickif reviews…
            </p>
          }
        >
          <TickifReviewsSection
            designerProfileId={portfolio.profileId}
            slug={slug}
            bookingId={booking.success ? (booking.data ?? undefined) : undefined}
            page={pagination.success ? pagination.data.page : 1}
          />
        </Suspense>
      }
    />
  );
}
