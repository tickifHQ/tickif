import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { cache } from 'react';
import { PublicDesignerProfile } from '@/components/public-designer-profile';
import { fetchPublicPortfolio } from '@/lib/public-portfolio-api';
import { strapline, studioLocation, studioType } from '@/lib/public-portfolio-view';

type PublicDesignerProfilePageProps = {
  params: Promise<{ slug: string }>;
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

  return {
    title: `${portfolio.displayName} | Tickif`,
    description,
    alternates: { canonical: portfolio.canonicalUrl },
    openGraph: {
      type: 'profile',
      title: `${portfolio.displayName} — ${studioType(portfolio)}`,
      description,
      url: portfolio.canonicalUrl,
      images: portfolio.projects.projects
        .map((project) => project.coverImageUrl)
        .filter((url): url is string => !!url)
        .slice(0, 1),
    },
  };
}

export default async function PublicDesignerProfilePage({
  params,
}: PublicDesignerProfilePageProps) {
  const { slug } = await params;
  // `generateMetadata` already ran the gate; this is a cache hit that also
  // re-narrows the type for the render.
  const portfolio = await resolvePortfolio(slug);

  return <PublicDesignerProfile portfolio={portfolio} />;
}
