'use client';

import { Funnel } from 'lucide-react';

export type FilterChip = {
  slug: string;
  label: string;
  kind: 'citySlug' | 'bhkSlug' | 'budgetBandSlug' | 'scopeSlug';
};

interface FeedFiltersProps {
  chips?: FilterChip[];
  activeFilter?: FilterChip | null;
  onFilterChange?: (filter: FilterChip | null) => void;
}

/**
 * Filter bar with "All" + taxonomy-driven chips. When chips are provided,
 * clicking one calls onFilterChange to trigger a filtered discovery feed fetch.
 * Falls back to a static placeholder if no chips are provided.
 */
export function FeedFilters({ chips, activeFilter, onFilterChange }: FeedFiltersProps) {
  const hasInteractivity = chips && chips.length > 0 && onFilterChange;

  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <Funnel className="size-3.5" aria-hidden />
        Filters
      </button>
      <span className="h-6 w-px shrink-0 bg-border" />
      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button
          type="button"
          onClick={() => onFilterChange?.(null)}
          className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
            !activeFilter
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground'
          }`}
        >
          All
        </button>
        {hasInteractivity
          ? chips.map((chip) => (
              <button
                key={`${chip.kind}:${chip.slug}`}
                type="button"
                onClick={() => onFilterChange(activeFilter?.slug === chip.slug ? null : chip)}
                className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  activeFilter?.slug === chip.slug
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground'
                }`}
              >
                {chip.label}
              </button>
            ))
          : defaultChips.map((label) => (
              <button
                key={label}
                type="button"
                className="shrink-0 whitespace-nowrap rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                {label}
              </button>
            ))}
      </div>
    </div>
  );
}

const defaultChips = [
  'Affordable modular kitchens',
  'Modern 2BHK interiors',
  'Scandinavian-style apartments',
  'Cozy bedroom ideas',
];
