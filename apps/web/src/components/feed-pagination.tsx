import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@repo/ui/components/button';

type FeedPaginationProps = {
  page: number;
  previousHref: string | null;
  nextHref: string | null;
};

/**
 * Visible prev/next control for the crawlable feed pages.
 *
 * "Load more" only ever moves forward, so a visitor landing on `/?page=3` needs a
 * real way back. These are plain links, so they work without JavaScript and are
 * keyboard reachable in document order.
 */
export function FeedPagination({ page, previousHref, nextHref }: FeedPaginationProps) {
  if (!previousHref && !nextHref) return null;

  return (
    <nav aria-label="Feed pages" className="mt-6 flex items-center justify-center gap-3">
      {previousHref ? (
        <Button asChild variant="outline" size="sm">
          <Link href={previousHref} rel="prev">
            <ChevronLeft className="size-4" aria-hidden />
            Previous page
          </Link>
        </Button>
      ) : null}

      <p className="text-sm text-muted-foreground" aria-current="page">
        Page {page}
      </p>

      {nextHref ? (
        <Button asChild variant="outline" size="sm">
          <Link href={nextHref} rel="next">
            Next page
            <ChevronRight className="size-4" aria-hidden />
          </Link>
        </Button>
      ) : null}
    </nav>
  );
}
