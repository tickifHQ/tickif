import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BlogBody } from '@/components/blog-body';
import { getCompanyPage } from '@/lib/company-content';
import { companyPages } from '@/lib/company-pages';
import { Badge } from '@repo/ui/components/badge';
import { typography } from '@repo/ui/lib/typography';
import { cn } from '@repo/ui/lib/utils';

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return companyPages.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = await getCompanyPage((await params).slug);
  return {
    title: `${page?.title ?? 'Page not found'} | Tickif`,
    description: page?.description,
    robots: { index: false, follow: false },
  };
}

export default async function CompanyPage({ params }: Props) {
  const page = await getCompanyPage((await params).slug);
  if (!page) notFound();

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 sm:py-14">
      <Link
        href="/"
        className={cn(
          typography.labelMd,
          'inline-flex min-h-11 items-center text-primary underline underline-offset-4',
        )}
      >
        Back to Tickif
      </Link>
      <div className="mt-6 grid gap-10 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-16">
        <aside className="order-2 min-w-0 lg:order-1">
          <div className="lg:sticky lg:top-28">
            <p className={cn(typography.monoSm, 'mb-3 text-muted-foreground uppercase')}>Company</p>
            <nav aria-label="Company pages" className="flex flex-wrap gap-1 lg:flex-col">
              {companyPages.map((entry) => (
                <Link
                  key={entry.slug}
                  href={`/company/${entry.slug}`}
                  aria-current={entry.slug === page.slug ? 'page' : undefined}
                  className={cn(
                    typography.labelMd,
                    'flex min-h-11 items-center rounded-lg px-3 py-3 transition-colors hover:bg-muted',
                    entry.slug === page.slug
                      ? 'bg-primary-soft text-primary-soft-foreground'
                      : 'text-foreground-secondary',
                  )}
                >
                  {entry.title}
                </Link>
              ))}
            </nav>
            <nav
              aria-label="On this page"
              className="mt-8 hidden border-t border-border pt-6 lg:block"
            >
              <p className={cn(typography.monoSm, 'mb-3 text-muted-foreground uppercase')}>
                On this page
              </p>
              <ol className="space-y-1">
                {page.sections.map((section) => (
                  <li key={section.id}>
                    <a
                      href={`#${section.id}`}
                      className={cn(
                        typography.bodySm,
                        'block rounded-sm py-2 text-foreground-secondary underline-offset-4 hover:text-primary hover:underline',
                      )}
                    >
                      {section.title}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          </div>
        </aside>
        <article id="document-top" className="order-1 min-w-0 lg:order-2">
          <header className="border-b border-border pb-7">
            <div className="mb-5 flex flex-wrap items-center gap-3">
              <Badge variant="soft">
                {page.status === 'draft' ? 'Draft for review' : 'Sample document'}
              </Badge>
              {page.status === 'draft' && (
                <time
                  dateTime="2026-10-10"
                  className={cn(typography.monoSm, 'text-muted-foreground')}
                >
                  10 OCT 2026
                </time>
              )}
              <span className={cn(typography.monoSm, 'text-muted-foreground')}>
                {page.readingMinutes} MIN READ
              </span>
            </div>
            <h1
              className={cn(
                typography.headingH1,
                'text-[32px] leading-[38px] text-pretty sm:text-[44px] sm:leading-[48px]',
              )}
            >
              {page.title}
            </h1>
            <p className={cn(typography.bodyLg, 'mt-4 max-w-2xl text-foreground-secondary')}>
              {page.description}
            </p>
          </header>
          <details className="mt-6 rounded-lg border border-border bg-card lg:hidden">
            <summary className={cn(typography.labelMd, 'min-h-12 cursor-pointer px-4 py-4')}>
              On this page
            </summary>
            <nav aria-label="Document sections" className="border-t border-border px-4 py-2">
              {page.sections.map((section) => (
                <a
                  key={section.id}
                  href={`#${section.id}`}
                  className={cn(
                    typography.bodySm,
                    'flex min-h-11 items-center py-2 text-primary underline underline-offset-4',
                  )}
                >
                  {section.title}
                </a>
              ))}
            </nav>
          </details>
          <BlogBody content={page.content} sectionIds />
          <div className="mt-10 border-t border-border pt-5">
            <a
              href="#document-top"
              className={cn(
                typography.labelMd,
                'inline-flex min-h-11 items-center text-primary underline underline-offset-4',
              )}
            >
              Back to top
            </a>
          </div>
        </article>
      </div>
    </div>
  );
}
