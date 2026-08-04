'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { Input } from '@repo/ui/components/input';
import { cn } from '@repo/ui/lib/utils';
import { Search } from 'lucide-react';

export type DesignerListTab<TValue extends string> = {
  value: TValue;
  label: string;
  count?: number;
};

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

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;

  return (
    target.isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) ||
    target.getAttribute('role') === 'textbox'
  );
}

export function DesignerListControls<TValue extends string>({
  tabs,
  activeTab,
  searchPlaceholder = 'Search',
  searchValue,
}: {
  tabs: DesignerListTab<TValue>[];
  activeTab: TValue;
  searchPlaceholder?: string;
  searchValue?: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const isSlashShortcut =
        event.key === '/' || event.key === 'Slash' || (event.code === 'Slash' && !event.shiftKey);

      if (
        !isSlashShortcut ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        isEditableTarget(event.target)
      )
        return;

      event.preventDefault();
      searchInputRef.current?.focus();
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="inline-flex w-fit items-center gap-0.5 rounded-lg bg-muted p-1">
        {tabs.map((tab) => {
          const active = tab.value === activeTab;
          return (
            <Link
              key={tab.value}
              href={queryHref(pathname, searchParams, {
                status: tab.value === 'all' ? null : tab.value,
                page: 1,
              })}
              className={cn(
                'inline-flex h-7 items-center gap-1.5 rounded-md px-3 text-[13px] leading-none font-medium transition-colors',
                active
                  ? 'bg-background text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              aria-current={active ? 'page' : undefined}
            >
              {tab.label}
              {typeof tab.count === 'number' ? (
                <span className="rounded-full border border-border bg-muted/40 px-1.5 py-0.5 text-xs leading-none text-muted-foreground">
                  {tab.count}
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>
      <form action={pathname} className="relative w-full sm:w-[17.5rem]">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={searchInputRef}
          name="q"
          defaultValue={searchValue}
          placeholder={searchPlaceholder}
          aria-keyshortcuts="/"
          className="h-8 rounded-md pl-9 pr-9 text-[13px] shadow-xs"
        />
        {activeTab !== 'all' ? <input type="hidden" name="status" value={activeTab} /> : null}
        <input type="hidden" name="page" value="1" />
        <kbd className="pointer-events-none absolute top-1/2 right-2 inline-flex h-5 min-w-5 -translate-y-1/2 items-center justify-center rounded border border-border bg-muted px-1 text-[11px] leading-none font-medium text-muted-foreground">
          /
        </kbd>
      </form>
    </div>
  );
}
