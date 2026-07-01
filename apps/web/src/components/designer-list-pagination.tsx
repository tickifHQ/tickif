'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
} from '@repo/ui/components/pagination';
import { cn } from '@repo/ui/lib/utils';
import { ChevronsLeft, ChevronsRight, ChevronLeft, ChevronRight, ChevronsUpDown } from 'lucide-react';

function pageItems(page: number, totalPages: number) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set([1, totalPages, page - 1, page, page + 1]);
  return Array.from(pages)
    .filter((item) => item >= 1 && item <= totalPages)
    .sort((left, right) => left - right)
    .reduce<Array<number | 'ellipsis'>>((items, item) => {
      const previous = items.at(-1);
      if (typeof previous === 'number' && item - previous > 1) {
        items.push('ellipsis');
      }
      items.push(item);
      return items;
    }, []);
}

function queryHref(pathname: string, searchParams: URLSearchParams, updates: Record<string, string | number | null>) {
  const next = new URLSearchParams(searchParams);
  for (const [key, value] of Object.entries(updates)) {
    if (value === null || value === '') {
      next.delete(key);
    } else {
      next.set(key, String(value));
    }
  }
  const query = next.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function DesignerListPagination({
  page,
  totalPages,
  limit,
  total,
  className,
}: {
  page: number;
  totalPages: number;
  limit: number;
  total: number;
  className?: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const safeTotalPages = Math.max(totalPages, 1);
  const currentPage = Math.min(Math.max(page, 1), safeTotalPages);
  const canGoPrevious = currentPage > 1;
  const canGoNext = currentPage < safeTotalPages;

  function handleLimitChange(nextLimit: string) {
    router.replace(queryHref(pathname, searchParams, { limit: nextLimit, page: 1 }));
  }

  return (
    <div className={cn('grid min-h-10 grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-lg bg-muted/40 px-4 py-1.5', className)}>
      <p className="text-[13px] leading-5 font-medium text-muted-foreground">
        Page {currentPage} of {safeTotalPages}
        {total === 0 ? ' · 0 items' : null}
      </p>
      <Pagination className="w-auto">
        <PaginationContent className="overflow-hidden rounded-lg border border-border bg-background shadow-xs">
          <PaginationItem>
            <PaginationLink asChild className={cn('border-y-0 border-l-0 px-2', !canGoPrevious && 'pointer-events-none opacity-40')}>
              <Link href={queryHref(pathname, searchParams, { page: 1 })} aria-label="First page">
                <ChevronsLeft className="size-4" />
              </Link>
            </PaginationLink>
          </PaginationItem>
          <PaginationItem>
            <PaginationLink asChild className={cn('border-y-0 border-l-0 px-2', !canGoPrevious && 'pointer-events-none opacity-40')}>
              <Link href={queryHref(pathname, searchParams, { page: currentPage - 1 })} aria-label="Previous page">
                <ChevronLeft className="size-4" />
              </Link>
            </PaginationLink>
          </PaginationItem>
          {pageItems(currentPage, safeTotalPages).map((item, index) =>
            item === 'ellipsis' ? (
              <PaginationItem key={`ellipsis-${index}`}>
                <PaginationEllipsis className="border-y-0 border-l-0" />
              </PaginationItem>
            ) : (
              <PaginationItem key={item}>
                <PaginationLink asChild isActive={item === currentPage} className="border-y-0 border-l-0">
                  <Link href={queryHref(pathname, searchParams, { page: item })}>{item}</Link>
                </PaginationLink>
              </PaginationItem>
            ),
          )}
          <PaginationItem>
            <PaginationLink asChild className={cn('border-y-0 border-l-0 px-2', !canGoNext && 'pointer-events-none opacity-40')}>
              <Link href={queryHref(pathname, searchParams, { page: currentPage + 1 })} aria-label="Next page">
                <ChevronRight className="size-4" />
              </Link>
            </PaginationLink>
          </PaginationItem>
          <PaginationItem>
            <PaginationLink asChild className={cn('border-y-0 border-r-0 px-2', !canGoNext && 'pointer-events-none opacity-40')}>
              <Link href={queryHref(pathname, searchParams, { page: safeTotalPages })} aria-label="Last page">
                <ChevronsRight className="size-4" />
              </Link>
            </PaginationLink>
          </PaginationItem>
        </PaginationContent>
      </Pagination>
      <div className="justify-self-end">
        <label className="sr-only" htmlFor="designer-list-page-size">Rows per page</label>
        <div className="relative">
          <select
            id="designer-list-page-size"
            value={String(limit)}
            onChange={(event) => handleLimitChange(event.target.value)}
            className="h-8 appearance-none rounded-md border border-border bg-background px-3 pr-8 text-[13px] leading-none font-medium text-muted-foreground shadow-xs outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
          >
            {[12, 24, 36, 48].map((option) => (
              <option key={option} value={option}>
                {option} / page
              </option>
            ))}
          </select>
          <ChevronsUpDown className="pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        </div>
      </div>
    </div>
  );
}
