'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';

type Props = {
  field: string;
  label: string;
  currentSort?: string;
  currentOrder?: string;
};

export function SortableHeader({ field, label, currentSort, currentOrder }: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const isActive = currentSort === field;
  const nextOrder = isActive && currentOrder === 'desc' ? 'asc' : isActive && currentOrder === 'asc' ? undefined : 'desc';

  const next = new URLSearchParams(searchParams);
  if (nextOrder) {
    next.set('sortBy', field);
    next.set('sortOrder', nextOrder);
  } else {
    next.delete('sortBy');
    next.delete('sortOrder');
  }
  next.set('page', '1');
  const query = next.toString();
  const href = query ? `${pathname}?${query}` : pathname;

  return (
    <Link href={href} className="inline-flex items-center gap-1 hover:text-foreground transition-colors">
      {label}
      {isActive && currentOrder === 'desc' ? (
        <ArrowDown className="size-3.5" />
      ) : isActive && currentOrder === 'asc' ? (
        <ArrowUp className="size-3.5" />
      ) : (
        <ArrowUpDown className="size-3.5 opacity-40" />
      )}
    </Link>
  );
}
