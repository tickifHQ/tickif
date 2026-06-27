import { Slot } from '@radix-ui/react-slot';
import type { ComponentProps } from 'react';
import { cn } from '../lib/utils';

export function Pagination({ className, ...props }: ComponentProps<'nav'>) {
  return (
    <nav
      data-slot="pagination"
      role="navigation"
      aria-label="pagination"
      className={cn('mx-auto flex w-full justify-center', className)}
      {...props}
    />
  );
}

export function PaginationContent({ className, ...props }: ComponentProps<'ul'>) {
  return <ul data-slot="pagination-content" className={cn('flex flex-row items-center', className)} {...props} />;
}

export function PaginationItem({ className, ...props }: ComponentProps<'li'>) {
  return <li data-slot="pagination-item" className={cn('', className)} {...props} />;
}

export function PaginationLink({
  className,
  isActive,
  asChild = false,
  ...props
}: ComponentProps<'a'> & {
  isActive?: boolean;
  asChild?: boolean;
}) {
  const Comp = asChild ? Slot : 'a';

  return (
    <Comp
      data-slot="pagination-link"
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        'inline-flex h-8 min-w-10 items-center justify-center border border-border bg-background px-3 text-[13px] leading-none font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
        isActive && 'bg-muted text-foreground',
        className,
      )}
      {...props}
    />
  );
}

export function PaginationEllipsis({ className, ...props }: ComponentProps<'span'>) {
  return (
    <span
      data-slot="pagination-ellipsis"
      aria-hidden="true"
      className={cn('inline-flex h-8 min-w-10 items-center justify-center border-y border-border bg-background px-3 text-muted-foreground', className)}
      {...props}
    >
      ...
    </span>
  );
}
