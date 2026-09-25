'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { SearchDesignersQuery } from '@repo/contracts';
import { Button } from '@repo/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@repo/ui/components/dropdown-menu';
import { ArrowDownWideNarrow, ArrowRight, Funnel, Search, X } from 'lucide-react';
import {
  DESIGNER_FACETS,
  designerFacetLabel,
  designerPageHref,
  facetValues,
  type DesignerFacetKey,
  type DesignerFacetOptions,
} from '@/lib/designer-discovery-params';

type DesignerEntityType = NonNullable<SearchDesignersQuery['entityType']>;
type DesignerFacetDraft = Record<DesignerFacetKey, string[]>;

const SORT_OPTIONS = [
  { value: 'relevance', label: 'Most relevant' },
  { value: 'avgRating:desc', label: 'Highest rated' },
  { value: 'projectCount:desc', label: 'Most projects' },
  { value: 'reviewCount:desc', label: 'Most reviewed' },
  { value: 'yearsExperience:desc', label: 'Most experienced' },
] as const satisfies ReadonlyArray<{
  value: SearchDesignersQuery['sort'];
  label: string;
}>;

const ENTITY_TYPE_OPTIONS = [
  { value: 'individual', label: 'Individuals' },
  { value: 'company', label: 'Studios' },
] as const satisfies ReadonlyArray<{ value: DesignerEntityType; label: string }>;

function facetsFromQuery(query: SearchDesignersQuery): DesignerFacetDraft {
  return Object.fromEntries(
    DESIGNER_FACETS.map(({ key }) => [key, facetValues(query[key])]),
  ) as DesignerFacetDraft;
}

function selectedFilterCount(facets: DesignerFacetDraft, entityType?: DesignerEntityType) {
  return (
    DESIGNER_FACETS.reduce((total, { key }) => total + facets[key].length, 0) + (entityType ? 1 : 0)
  );
}

function withFilters(
  query: SearchDesignersQuery,
  facets: DesignerFacetDraft,
  entityType?: DesignerEntityType,
) {
  const next: SearchDesignersQuery = { ...query, page: 1 };
  for (const { key } of DESIGNER_FACETS) {
    const values = facetValues(facets[key]);
    if (values.length > 0) next[key] = values;
    else delete next[key];
  }
  if (entityType) next.entityType = entityType;
  else delete next.entityType;
  return next;
}

function optionLabel(options: DesignerFacetOptions, key: DesignerFacetKey, value: string) {
  return options[key].find((option) => option.value === value)?.label ?? designerFacetLabel(value);
}

export function DesignerDiscoveryFilters({
  query,
  options,
}: {
  query: SearchDesignersQuery;
  options: DesignerFacetOptions;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [searchQuery, setSearchQuery] = useState(query.q);
  const [sort, setSort] = useState(query.sort);
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const appliedFacets = facetsFromQuery(query);
  const [draftFacets, setDraftFacets] = useState<DesignerFacetDraft>(appliedFacets);
  const [draftEntityType, setDraftEntityType] = useState<DesignerEntityType | undefined>(
    query.entityType,
  );
  const appliedFilterCount = selectedFilterCount(appliedFacets, query.entityType);
  const draftFilterCount = selectedFilterCount(draftFacets, draftEntityType);
  const currentSortLabel =
    SORT_OPTIONS.find((option) => option.value === sort)?.label ?? 'Most relevant';
  const isDefaultDirectory =
    query.q.length === 0 && appliedFilterCount === 0 && sort === 'relevance';

  function navigate(next: SearchDesignersQuery) {
    startTransition(() => router.push(designerPageHref(next, 1)));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate({ ...query, q: searchQuery.trim(), sort, page: 1 });
  }

  function handleFilterMenuOpenChange(open: boolean) {
    setFilterMenuOpen(open);
    if (open) {
      setDraftFacets(appliedFacets);
      setDraftEntityType(query.entityType);
    }
  }

  function toggleDraftFacet(key: DesignerFacetKey, value: string, checked: boolean) {
    setDraftFacets((current) => {
      const values = new Set(current[key]);
      if (checked) values.add(value);
      else values.delete(value);
      return { ...current, [key]: [...values] };
    });
  }

  function applyDraftFilters() {
    navigate(withFilters({ ...query, sort }, draftFacets, draftEntityType));
    setFilterMenuOpen(false);
  }

  function selectEntityType(entityType?: DesignerEntityType) {
    navigate(withFilters({ ...query, sort }, appliedFacets, entityType));
  }

  function removeFacet(key: DesignerFacetKey, value: string) {
    navigate(
      withFilters(
        { ...query, sort },
        { ...appliedFacets, [key]: appliedFacets[key].filter((entry) => entry !== value) },
        query.entityType,
      ),
    );
  }

  function clearAll() {
    setSearchQuery('');
    setSort('relevance');
    setDraftFacets({ citySlugs: [], localitySlugs: [], scopeSlugs: [], themeSlugs: [] });
    setDraftEntityType(undefined);
    startTransition(() => router.push('/designers'));
  }

  function clearSearch() {
    setSearchQuery('');
    if (query.q) navigate({ ...query, q: '', sort, page: 1 });
  }

  function changeSort(value: string) {
    const option = SORT_OPTIONS.find((candidate) => candidate.value === value);
    if (!option) return;
    setSort(option.value);
    navigate({ ...query, sort: option.value, page: 1 });
  }

  return (
    <div className="min-w-0 w-full space-y-3" aria-busy={isPending}>
      <form role="search" aria-label="Find designers" onSubmit={submit} className="w-full">
        <div className="flex items-center gap-3 rounded-xl border border-border bg-background py-1.5 pl-4 pr-1.5 shadow-home-search transition-shadow focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
          <Search className="size-4 shrink-0 text-primary" aria-hidden />
          <input
            type="search"
            name="q"
            autoComplete="off"
            maxLength={200}
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search by designer, studio or style…"
            aria-label="Search designers"
            className="h-9 min-w-0 flex-1 appearance-none bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden"
          />
          {searchQuery.length > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-6 shrink-0 rounded-full p-0 text-primary shadow-none hover:bg-transparent hover:text-primary"
              aria-label="Clear search"
              onClick={clearSearch}
            >
              <X className="size-3.5" aria-hidden />
            </Button>
          ) : null}
          <Button
            type="submit"
            variant="emphasis"
            size="compact"
            className="shrink-0"
            disabled={isPending}
          >
            <span className="hidden sm:inline">Find designers</span>
            <span className="sm:hidden">Find</span>
            <ArrowRight className="size-4" aria-hidden />
          </Button>
        </div>
      </form>

      <div className="flex min-w-0 max-w-full items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <DropdownMenu open={filterMenuOpen} onOpenChange={handleFilterMenuOpenChange}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              disabled={isPending}
              aria-label={
                appliedFilterCount > 0
                  ? `Designer filters (${appliedFilterCount} selected)`
                  : 'Designer filters'
              }
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
            >
              <Funnel className="size-3.5" aria-hidden />
              Filters
              {appliedFilterCount > 0 ? ` (${appliedFilterCount})` : null}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuLabel>Filter designers</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {DESIGNER_FACETS.map(({ key, label }) => (
              <DropdownMenuSub key={key}>
                <DropdownMenuSubTrigger disabled={options[key].length === 0}>
                  <span>{label}</span>
                  {draftFacets[key].length > 0 ? ` (${draftFacets[key].length})` : null}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-60">
                  <DropdownMenuLabel>{label}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <div className="max-h-72 overflow-y-auto">
                    {options[key].map((option) => (
                      <DropdownMenuCheckboxItem
                        key={option.value}
                        checked={draftFacets[key].includes(option.value)}
                        onCheckedChange={(checked) =>
                          toggleDraftFacet(key, option.value, checked === true)
                        }
                        onSelect={(event) => event.preventDefault()}
                      >
                        <span className="min-w-0 flex-1 truncate">{option.label}</span>
                      </DropdownMenuCheckboxItem>
                    ))}
                  </div>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            ))}
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <span>Designer type</span>
                {draftEntityType ? ' (1)' : null}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-52">
                <DropdownMenuLabel>Designer type</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuRadioGroup
                  value={draftEntityType ?? 'all'}
                  onValueChange={(value) =>
                    setDraftEntityType(
                      value === 'individual' || value === 'company' ? value : undefined,
                    )
                  }
                >
                  <DropdownMenuRadioItem value="all">All designers</DropdownMenuRadioItem>
                  {ENTITY_TYPE_OPTIONS.map((option) => (
                    <DropdownMenuRadioItem key={option.value} value={option.value}>
                      {option.label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <div className="flex justify-end px-1 py-1">
              <Button type="button" onClick={applyDraftFilters} variant="emphasis" size="compact">
                {draftFilterCount > 0
                  ? `Apply ${draftFilterCount} ${draftFilterCount === 1 ? 'filter' : 'filters'}`
                  : 'Apply filters'}
              </Button>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              disabled={isPending}
              aria-label="Sort designers"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
            >
              <ArrowDownWideNarrow className="size-3.5" aria-hidden />
              {currentSortLabel}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52">
            <DropdownMenuLabel>Sort designers</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup value={sort} onValueChange={changeSort}>
              {SORT_OPTIONS.map((option) => (
                <DropdownMenuRadioItem key={option.value} value={option.value}>
                  {option.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <span className="h-6 w-px shrink-0 bg-border" aria-hidden />
        <button
          type="button"
          aria-label="All designers"
          aria-pressed={isDefaultDirectory}
          disabled={isPending}
          onClick={clearAll}
          className={`inline-flex shrink-0 items-center rounded-full border px-3 py-1 text-xs transition-colors disabled:pointer-events-none disabled:opacity-50 ${
            isDefaultDirectory
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground'
          }`}
        >
          All
        </button>
        {ENTITY_TYPE_OPTIONS.map((option) => {
          const selected = query.entityType === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              disabled={isPending}
              onClick={() => selectEntityType(selected ? undefined : option.value)}
              className={`inline-flex shrink-0 items-center rounded-full border px-3 py-1 text-xs transition-colors disabled:pointer-events-none disabled:opacity-50 ${
                selected
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      {appliedFilterCount > 0 ? (
        <div className="flex flex-wrap items-center gap-2" aria-label="Applied designer filters">
          {DESIGNER_FACETS.flatMap(({ key }) =>
            appliedFacets[key].map((value) => {
              const label = optionLabel(options, key, value);
              return (
                <button
                  key={`${key}-${value}`}
                  type="button"
                  disabled={isPending}
                  onClick={() => removeFacet(key, value)}
                  className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/15 disabled:pointer-events-none disabled:opacity-50"
                  aria-label={`Remove ${label} filter`}
                >
                  {label}
                  <X className="size-3" aria-hidden />
                </button>
              );
            }),
          )}
          {query.entityType ? (
            <button
              type="button"
              disabled={isPending}
              onClick={() => selectEntityType(undefined)}
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/15 disabled:pointer-events-none disabled:opacity-50"
              aria-label={`Remove ${query.entityType === 'company' ? 'Studios' : 'Individuals'} filter`}
            >
              {query.entityType === 'company' ? 'Studios' : 'Individuals'}
              <X className="size-3" aria-hidden />
            </button>
          ) : null}
          <button
            type="button"
            disabled={isPending}
            onClick={clearAll}
            className="px-1 text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:pointer-events-none disabled:opacity-50"
          >
            Clear all
          </button>
        </div>
      ) : null}
    </div>
  );
}
