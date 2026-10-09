'use client';

import type { ReactNode } from 'react';
import { useId } from 'react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@repo/ui/components/select';
import { ChevronsLeft, ChevronsRight, ChevronLeft, ChevronRight } from 'lucide-react';

const DEFAULT_PAGE_SIZES = [12, 24, 36, 48] as const;

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

function queryHref(
  pathname: string,
  searchParams: URLSearchParams,
  updates: Record<string, string | number | null>,
) {
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

function PageControl({
  page,
  href,
  label,
  disabled,
  current,
  className,
  onPageChange,
  children,
}: {
  page: number;
  href?: string;
  label?: string;
  disabled: boolean;
  current?: boolean;
  className?: string;
  onPageChange?: (page: number) => void;
  children: ReactNode;
}) {
  if (!onPageChange && !href) {
    throw new Error('Pagination controls require an href or a page-change handler.');
  }
  const controlClassName = cn(className, disabled && 'pointer-events-none opacity-40');

  return (
    <PaginationItem>
      <PaginationLink asChild isActive={current} className={controlClassName}>
        {onPageChange ? (
          <button
            type="button"
            aria-label={label}
            disabled={disabled}
            onClick={() => onPageChange(page)}
          >
            {children}
          </button>
        ) : (
          <Link
            href={href ?? '#'}
            aria-label={label}
            aria-disabled={disabled || undefined}
            tabIndex={disabled ? -1 : undefined}
          >
            {children}
          </Link>
        )}
      </PaginationLink>
    </PaginationItem>
  );
}

type ListPaginationProps = {
  page: number;
  totalPages: number;
  limit: number;
  total: number;
  itemName?: string;
  itemNamePlural?: string;
  className?: string;
  disabled?: boolean;
  showPageSize?: boolean;
  pageSizes?: readonly number[];
  hrefForPage?: (page: number) => string;
  onPageChange?: (page: number) => void;
  onLimitChange?: (limit: number) => void;
};

export function ListPagination({
  page,
  totalPages,
  limit,
  total,
  itemName,
  itemNamePlural,
  className,
  disabled = false,
  showPageSize = true,
  pageSizes = DEFAULT_PAGE_SIZES,
  hrefForPage,
  onPageChange,
  onLimitChange,
}: ListPaginationProps) {
  const pageSizeId = useId();
  const safeTotalPages = Math.max(totalPages, 1);
  const currentPage = Math.min(Math.max(page, 1), safeTotalPages);
  const canGoPrevious = !disabled && currentPage > 1;
  const canGoNext = !disabled && currentPage < safeTotalPages;
  const summary = itemName
    ? `Page ${currentPage} of ${safeTotalPages} · ${total} ${total === 1 ? itemName : (itemNamePlural ?? `${itemName}s`)}`
    : `Page ${currentPage} of ${safeTotalPages}${total === 0 ? ' · 0 items' : ''}`;
  const href = (targetPage: number) => hrefForPage?.(targetPage);

  if (showPageSize && !onLimitChange) {
    throw new Error('Page-size controls require a limit-change handler.');
  }

  function handleLimitChange(nextLimit: string) {
    const parsedLimit = Number(nextLimit);
    onLimitChange?.(parsedLimit);
  }

  return (
    <div
      className={cn(
        'grid min-h-10 grid-cols-1 items-center gap-3 rounded-lg bg-muted/40 px-4 py-1.5 sm:grid-cols-[1fr_auto_1fr]',
        className,
      )}
    >
      <p
        className="justify-self-start text-sm leading-5 font-medium text-muted-foreground"
        aria-live="polite"
      >
        {summary}
      </p>
      <Pagination className="max-w-full justify-self-center overflow-x-auto sm:w-auto">
        <PaginationContent className="overflow-hidden rounded-lg border border-border bg-background shadow-xs">
          <PageControl
            page={1}
            href={href(1)}
            label="First page"
            disabled={!canGoPrevious}
            className="border-y-0 border-l-0 px-2"
            onPageChange={onPageChange}
          >
            <ChevronsLeft className="size-4" />
          </PageControl>
          <PageControl
            page={currentPage - 1}
            href={href(currentPage - 1)}
            label="Previous page"
            disabled={!canGoPrevious}
            className="border-y-0 border-l-0 px-2"
            onPageChange={onPageChange}
          >
            <ChevronLeft className="size-4" />
          </PageControl>
          {pageItems(currentPage, safeTotalPages).map((item, index) =>
            item === 'ellipsis' ? (
              <PaginationItem key={`ellipsis-${index}`}>
                <PaginationEllipsis className="border-y-0 border-l-0" />
              </PaginationItem>
            ) : (
              <PageControl
                key={item}
                page={item}
                href={href(item)}
                disabled={disabled}
                current={item === currentPage}
                className="border-y-0 border-l-0"
                onPageChange={onPageChange}
              >
                {item}
              </PageControl>
            ),
          )}
          <PageControl
            page={currentPage + 1}
            href={href(currentPage + 1)}
            label="Next page"
            disabled={!canGoNext}
            className="border-y-0 border-l-0 px-2"
            onPageChange={onPageChange}
          >
            <ChevronRight className="size-4" />
          </PageControl>
          <PageControl
            page={safeTotalPages}
            href={href(safeTotalPages)}
            label="Last page"
            disabled={!canGoNext}
            className="border-y-0 border-r-0 px-2"
            onPageChange={onPageChange}
          >
            <ChevronsRight className="size-4" />
          </PageControl>
        </PaginationContent>
      </Pagination>
      <div className="justify-self-center sm:justify-self-end">
        {showPageSize ? (
          <>
            <label className="sr-only" htmlFor={pageSizeId}>
              Rows per page
            </label>
            <Select value={String(limit)} disabled={disabled} onValueChange={handleLimitChange}>
              <SelectTrigger
                id={pageSizeId}
                className="h-8 w-auto px-3 text-sm/none font-medium text-muted-foreground"
              >
                <SelectValue>{limit} / page</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {pageSizes.map((option) => (
                  <SelectItem key={option} value={String(option)}>
                    {option} / page
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        ) : null}
      </div>
    </div>
  );
}

export function UrlListPagination(
  props: Omit<ListPaginationProps, 'hrefForPage' | 'onPageChange' | 'onLimitChange'>,
) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  return (
    <ListPagination
      {...props}
      hrefForPage={(page) => queryHref(pathname, searchParams, { page })}
      onLimitChange={(limit) =>
        router.replace(queryHref(pathname, searchParams, { limit, page: 1 }))
      }
    />
  );
}
