import type { ComponentProps } from 'react';
import { Table } from '@repo/ui/components/table';
import { cn } from '@repo/ui/lib/utils';

export function AnalyticsDataTable({ className, ...props }: ComponentProps<typeof Table>) {
  return (
    <Table
      className={cn(
        'table-fixed border-separate border-spacing-0',
        '[&_thead_tr]:border-0',
        '[&_thead_th]:h-auto [&_thead_th]:border-y [&_thead_th]:border-border [&_thead_th]:bg-muted/40 [&_thead_th]:px-3 [&_thead_th]:py-2 [&_thead_th]:text-xs [&_thead_th]:font-normal',
        '[&_thead_th:first-child]:rounded-l-lg [&_thead_th:first-child]:border-l',
        '[&_thead_th:last-child]:rounded-r-lg [&_thead_th:last-child]:border-r',
        '[&_tbody_tr]:border-0 [&_tbody_tr]:hover:bg-transparent',
        '[&_tbody_td]:border-b [&_tbody_td]:border-border [&_tbody_td]:px-3 [&_tbody_td]:py-3',
        '[&_tbody_tr:last-child_td]:border-b-0',
        className,
      )}
      {...props}
    />
  );
}
