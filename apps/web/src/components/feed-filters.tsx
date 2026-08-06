'use client';

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@repo/ui/components/dropdown-menu';
import { X, Funnel } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
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

type FeedFilterTag = {
  facet: FeedFilterKey;
  slug: string;
  label: string;
  count?: number;
};

function stableTagOrder(tag: Pick<FeedFilterTag, 'facet' | 'slug'>) {
  let hash = 2166136261;
  for (const character of `${tag.facet}:${tag.slug}`) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function emptyFilterState(): FeedFilterState {
  return {
    city: [],
    bhk: [],
    propertyType: [],
    scope: [],
    budgetBand: [],
    room: [],
    theme: [],
  };
}

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
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState<FeedFilterState>(selected);
  const applied = FEED_FACET_DEFINITIONS.flatMap((facet) =>
    selected[facet.key].map((slug) => ({ facet, slug })),
  );
  const draftCount = FEED_FACET_DEFINITIONS.reduce(
    (total, facet) => total + draft[facet.key].length,
    0,
  );

  useEffect(() => {
    if (!isOpen) setDraft(selected);
  }, [isOpen, selected]);
  const suggestedTags = useMemo<FeedFilterTag[]>(() => {
    const candidates = FEED_FACET_DEFINITIONS.flatMap((facet) => {
      const distribution = facetDistribution[facet.apiKey] ?? {};
      return (options[facet.key] ?? []).map((option) => ({
        facet: facet.key,
        slug: option.slug,
        label: option.label,
        count: distribution[option.slug],
      }));
    });

    return candidates
      .filter((candidate) => candidate.count === undefined || candidate.count > 0)
      .sort((left, right) => stableTagOrder(left) - stableTagOrder(right))
      .slice(0, 10)
      .map(({ facet, slug, label, count }) => ({ facet, slug, label, count }));
  }, [facetDistribution, options]);

  function update(next: FeedFilterState) {
    router.push(hrefFor(pathname, next, currentParams));
    setDraft(next);
  }

  function toggleDraft(facet: FeedFilterKey, slug: string, checked: boolean) {
    const values = new Set(draft[facet]);
    if (checked) values.add(slug);
    else values.delete(slug);
    setDraft({ ...draft, [facet]: Array.from(values) });
  }

  function applyDraft() {
    update(draft);
    setIsOpen(false);
  }

  function remove(facet: FeedFilterKey, slug: string) {
    update({ ...selected, [facet]: selected[facet].filter((value) => value !== slug) });
  }

  function clearAll() {
    update(emptyFilterState());
  }

  function selectSuggestion(tag: FeedFilterTag) {
    const isSelected = selected[tag.facet].includes(tag.slug);
    update(isSelected ? emptyFilterState() : { ...emptyFilterState(), [tag.facet]: [tag.slug] });
  }

  return (
    <div className="min-w-0 max-w-full space-y-3">
      <div className="flex min-w-0 max-w-full items-center gap-3 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <DropdownMenu
          open={isOpen}
          onOpenChange={(nextOpen) => {
            setIsOpen(nextOpen);
            if (nextOpen) setDraft(selected);
          }}
        >
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <Funnel className="size-3.5" aria-hidden />
              Filters
              {applied.length > 0 ? ` (${applied.length})` : null}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuLabel>Filter projects</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {FEED_FACET_DEFINITIONS.map((facet) => {
              const facetOptions = options[facet.key] ?? [];
              const distribution = facetDistribution[facet.apiKey] ?? {};
              const count = draft[facet.key].length;

              return (
                <DropdownMenuSub key={facet.key}>
                  <DropdownMenuSubTrigger>
                    <span>{facet.label}</span>
                    {count > 0 ? ` (${count})` : null}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-60">
                    <DropdownMenuLabel>{facet.label}</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <div className="max-h-[26rem] overflow-y-auto">
                      {facetOptions.length > 0 ? (
                        facetOptions.map((option) => {
                          const optionCount = distribution[option.slug];
                          return (
                            <DropdownMenuCheckboxItem
                              key={option.slug}
                              checked={draft[facet.key].includes(option.slug)}
                              disabled={
                                optionCount === 0 && !draft[facet.key].includes(option.slug)
                              }
                              onCheckedChange={(checked) =>
                                toggleDraft(facet.key, option.slug, checked)
                              }
                              onSelect={(event) => event.preventDefault()}
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
                        <p className="px-2 py-2 text-xs text-muted-foreground">
                          No options available
                        </p>
                      )}
                    </div>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              );
            })}
            <DropdownMenuSeparator />
            <div className="flex justify-end px-1 py-1">
              <button
                type="button"
                onClick={applyDraft}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
              >
                Apply{draftCount > 0 ? ` (${draftCount})` : null}
              </button>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
        <span className="h-6 w-px shrink-0 bg-border" aria-hidden />
        <button
          type="button"
          aria-pressed={applied.length === 0}
          onClick={clearAll}
          className={`inline-flex shrink-0 items-center rounded-full border px-3 py-1 text-xs transition-colors ${
            applied.length === 0
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground'
          }`}
        >
          All
        </button>
        {suggestedTags.map((tag) => {
          const isSelected = selected[tag.facet].includes(tag.slug);
          return (
            <button
              key={`${tag.facet}-${tag.slug}`}
              type="button"
              aria-pressed={isSelected}
              onClick={() => selectSuggestion(tag)}
              className={`inline-flex shrink-0 items-center rounded-full border px-3 py-1 text-xs transition-colors ${
                isSelected
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
            >
              {tag.label}
            </button>
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
