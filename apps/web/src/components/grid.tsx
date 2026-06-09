import type { ReactNode } from 'react';

/** Number of columns the grid expands to on `md`+ viewports. */
type Cols = 1 | 2 | 3 | 4;

const colsClass: Record<Cols, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
  4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
};

/**
 * Mobile-first responsive grid. Starts single-column on the smallest screens
 * and expands toward `cols` at the `sm` and `lg` breakpoints.
 */
export function Grid({
  cols = 3,
  className = '',
  children,
}: {
  cols?: Cols;
  className?: string;
  children: ReactNode;
}) {
  return <div className={`grid gap-4 ${colsClass[cols]} ${className}`.trim()}>{children}</div>;
}
