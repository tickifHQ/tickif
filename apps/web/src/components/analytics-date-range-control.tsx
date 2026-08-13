'use client';

import { Button } from '@repo/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@repo/ui/components/dropdown-menu';
import { CalendarDays, ChevronDown } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';

const analyticsWindows = [
  { days: 7, label: 'Last 7 days' },
  { days: 30, label: 'Last 30 days' },
  { days: 90, label: 'Last 90 days' },
] as const;

function formatRange(from: string, to: string) {
  const formatter = new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const fromDate = new Date(from);
  const toDate = new Date(to);
  const fromParts = formatter.formatToParts(fromDate);
  const toParts = formatter.formatToParts(toDate);
  const fromDay = fromParts.find((part) => part.type === 'day')?.value ?? '';
  const fromMonth = fromParts.find((part) => part.type === 'month')?.value ?? '';
  const toDay = toParts.find((part) => part.type === 'day')?.value ?? '';
  const toMonth = toParts.find((part) => part.type === 'month')?.value ?? '';
  const toYear = toParts.find((part) => part.type === 'year')?.value ?? '';

  return `${fromDay} ${fromMonth} - ${toDay} ${toMonth}, ${toYear}`;
}

type AnalyticsDateRangeControlProps = {
  days: number;
  from: string;
  to: string;
};

export function AnalyticsDateRangeControl({ days, from, to }: AnalyticsDateRangeControlProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function selectWindow(value: string) {
    const nextDays = Number(value);
    if (nextDays === days) return;

    const params = new URLSearchParams(searchParams.toString());
    if (nextDays === 30) params.delete('days');
    else params.set('days', String(nextDays));
    const query = params.toString();

    startTransition(() => {
      router.push(query ? `${pathname}?${query}` : pathname);
    });
  }

  return (
    <div className="inline-flex h-8 overflow-hidden rounded-md border border-border bg-background">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="compact"
            className="h-full rounded-none border-r border-border shadow-none"
            disabled={isPending}
            aria-label={`Analytics period: last ${days} days`}
            aria-busy={isPending}
          >
            Last {days} days
            <ChevronDown data-icon="inline-end" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-40">
          <DropdownMenuGroup>
            <DropdownMenuRadioGroup value={String(days)} onValueChange={selectWindow}>
              {analyticsWindows.map((window) => (
                <DropdownMenuRadioItem key={window.days} value={String(window.days)}>
                  {window.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <output
        className="inline-flex items-center gap-2 px-3 text-sm font-medium text-foreground"
        aria-label="Selected analytics date range"
      >
        <CalendarDays className="size-4" aria-hidden="true" />
        {formatRange(from, to)}
      </output>
    </div>
  );
}
