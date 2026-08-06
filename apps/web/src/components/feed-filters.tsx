'use client';

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@repo/ui/components/dropdown-menu';
import { X, Funnel, ChevronDown } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMemo } from 'react';
import {
  FEED_FACET_DEFINITIONS,
  FEED_FILTER_KEYS,
  parseFeedParams,
  serializeFeedParams,
  type FeedFilterKey,
  type FeedFilterState,
} from '@/lib/feed-params';

export type FeedFacetOption = {
  slug: string;
  label: string;
};

export type FeedFacetOptions = Partial<Record<FeedFilterKey, FeedFacetOption[]>>;
export type FeedFacetDistribution = Record<string, Record<string, number>>;

type FeedFiltersProps = {
  options?: FeedFacetOptions;
  facetDistribution?: FeedFacetDistribution;
  initialFilters?: FeedFilterState;
};

function optionLabel(options: FeedFacetOption[] | undefined, slug: string) {
  return options?.find((option) => option.slug === slug)?.label ?? slug;
}

function hrefFor(pathname: string, state: FeedFilterState, current: URLSearchParams) {
  const params = serializeFeedParams(state, current);
  params.delete('page');
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

/** Taxonomy-driven filter controls with shareable URL state and applied chips. */
export function FeedFilters({
  options = {},
  facetDistribution = {},
  initialFilters,
}: FeedFiltersProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentParams = useMemo(() => new URLSearchParams(searchParams.toString()), [searchParams]);
  const selected = useMemo(() => {
    const hasFilterInUrl = FEED_FILTER_KEYS.some((key) => currentParams.has(key));
    return hasFilterInUrl || !initialFilters ? parseFeedParams(currentParams) : initialFilters;
  }, [currentParams, initialFilters]);
  const applied = FEED_FACET_DEFINITIONS.flatMap((facet) =>
    selected[facet.key].map((slug) => ({ facet, slug })),
  );

  function update(next: FeedFilterState) {
    router.push(hrefFor(pathname, next, currentParams));
  }

  function toggle(facet: FeedFilterKey, slug: string, checked: boolean) {
    const values = new Set(selected[facet]);
    if (checked) values.add(slug);
    else values.delete(slug);
    update({ ...selected, [facet]: Array.from(values) });
  }

  function remove(facet: FeedFilterKey, slug: string) {
    update({ ...selected, [facet]: selected[facet].filter((value) => value !== slug) });
  }

  function clearAll() {
    update({ city: [], bhk: [], propertyType: [], scope: [], budgetBand: [], room: [], theme: [] });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Funnel className="size-3.5" aria-hidden />
          Filters
        </div>
        <span className="h-6 w-px shrink-0 bg-border" aria-hidden />
        {FEED_FACET_DEFINITIONS.map((facet) => {
          const facetOptions = options[facet.key] ?? [];
          const distribution = facetDistribution[facet.apiKey] ?? {};
          const count = selected[facet.key].length;

          return (
            <DropdownMenu key={facet.key}>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  {facet.label}
                  {count > 0 ? ` (${count})` : null}
                  <ChevronDown className="size-3" aria-hidden />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-60">
                <DropdownMenuLabel>{facet.label}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <div className="max-h-[26rem] overflow-y-auto">
                  {facetOptions.length > 0 ? (
                    facetOptions.map((option) => {
                      const optionCount = distribution[option.slug];
                      return (
                        <DropdownMenuCheckboxItem
                          key={option.slug}
                          checked={selected[facet.key].includes(option.slug)}
                          disabled={optionCount === 0 && !selected[facet.key].includes(option.slug)}
                          onCheckedChange={(checked) => toggle(facet.key, option.slug, checked)}
                        >
                          <span className="min-w-0 flex-1 truncate">{option.label}</span>
                          {optionCount !== undefined ? (
                            <span className="ml-auto pl-3 text-xs text-muted-foreground">
                              {optionCount}
                            </span>
                          ) : null}
                        </DropdownMenuCheckboxItem>
                      );
                    })
                  ) : (
                    <p className="px-2 py-2 text-xs text-muted-foreground">No options available</p>
                  )}
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        })}
      </div>

      {applied.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2" aria-label="Applied filters">
          {applied.map(({ facet, slug }) => (
            <button
              key={`${facet.key}-${slug}`}
              type="button"
              onClick={() => remove(facet.key, slug)}
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/15"
              aria-label={`Remove ${optionLabel(options[facet.key], slug)} filter`}
            >
              {optionLabel(options[facet.key], slug)}
              <X className="size-3" aria-hidden />
            </button>
          ))}
          <button
            type="button"
            onClick={clearAll}
            className="px-1 text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            Clear all
          </button>
        </div>
      ) : null}
    </div>
  );
}
