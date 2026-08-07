'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useState } from 'react';
import { ArrowRight, Search } from 'lucide-react';
import { searchSuggestResponseSchema, type SearchSuggestResponse } from '@repo/contracts';
import { Button } from '@repo/ui/components/button';
import { api } from '@/lib/api';

const EMPTY_SUGGESTIONS: SearchSuggestResponse = {
  projects: [],
  designers: [],
  processingTimeMs: 0,
};

type HomeSearchBarProps = {
  initialQuery?: string;
  variant?: 'default' | 'hero';
};

/** Homepage search entry with blended project/designer suggestions after a 150 ms debounce. */
export function HomeSearchBar({ initialQuery = '', variant = 'default' }: HomeSearchBarProps) {
  const router = useRouter();
  const listboxId = useId();
  const [query, setQuery] = useState(initialQuery);
  const [suggestions, setSuggestions] = useState<SearchSuggestResponse>(EMPTY_SUGGESTIONS);
  const [isFocused, setIsFocused] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const trimmedQuery = query.trim();
  const hasSuggestions = suggestions.projects.length + suggestions.designers.length > 0;
  const showDropdown = isFocused && trimmedQuery.length > 0;

  useEffect(() => {
    if (!trimmedQuery) {
      setSuggestions(EMPTY_SUGGESTIONS);
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setIsLoading(true);
      try {
        const response = await api.api.search.suggest.$get(
          { query: { q: trimmedQuery } },
          { init: { signal: controller.signal } },
        );
        if (!response.ok) throw new Error('Suggestion request failed.');

        const parsed = searchSuggestResponseSchema.safeParse(await response.json());
        if (!parsed.success) throw new Error('Suggestion response was invalid.');
        setSuggestions(parsed.data);
      } catch {
        if (!controller.signal.aborted) setSuggestions(EMPTY_SUGGESTIONS);
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }, 150);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [trimmedQuery]);

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams();
    if (trimmedQuery) params.set('q', trimmedQuery);
    router.push(params.size > 0 ? `/?${params.toString()}` : '/');
    setIsFocused(false);
  }

  const shellClassName =
    variant === 'hero'
      ? 'border-home-search-border bg-home-search-background shadow-home-search'
      : 'border-border bg-background shadow-home-search';

  return (
    <form
      role="search"
      className="relative w-full"
      onSubmit={submitSearch}
      onFocus={() => setIsFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setIsFocused(false);
      }}
    >
      <div
        className={`flex items-center gap-3 rounded-xl border py-1.5 pl-4 pr-1.5 ${shellClassName}`}
      >
        <Search className="size-4 shrink-0 text-primary" aria-hidden />
        <input
          type="search"
          name="q"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setIsFocused(false);
          }}
          placeholder="Search by city, style, budget, room type…"
          aria-label="Search homes"
          aria-autocomplete="list"
          aria-controls={showDropdown ? listboxId : undefined}
          aria-expanded={showDropdown}
          className="h-9 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />
        {variant === 'hero' ? (
          <Button type="submit" variant="fancy" size="fancy" className="shrink-0">
            Explore
            <ArrowRight className="size-4" aria-hidden />
          </Button>
        ) : (
          <Button type="submit" variant="emphasis" size="compact" className="shrink-0">
            Explore
            <ArrowRight className="size-4" aria-hidden />
          </Button>
        )}
      </div>

      {showDropdown ? (
        <div
          id={listboxId}
          role="listbox"
          aria-label="Search suggestions"
          className="absolute inset-x-0 top-[calc(100%+0.5rem)] z-40 overflow-hidden rounded-xl border border-border bg-popover p-2 text-popover-foreground shadow-lg"
          onMouseDown={(event) => event.preventDefault()}
        >
          {suggestions.projects.length > 0 ? (
            <section aria-labelledby={`${listboxId}-projects`}>
              <p
                id={`${listboxId}-projects`}
                className="px-2 py-1 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground"
              >
                Projects
              </p>
              {suggestions.projects.map((project) => (
                <Link
                  key={project.id}
                  href={`/projects/${project.id}`}
                  role="option"
                  aria-selected="false"
                  className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-accent"
                >
                  {project.coverImageUrl ? (
                    <img
                      src={project.coverImageUrl}
                      alt=""
                      width={40}
                      height={40}
                      loading="lazy"
                      draggable={false}
                      className="size-10 rounded-md object-cover"
                    />
                  ) : (
                    <span className="size-10 rounded-md bg-muted" aria-hidden />
                  )}
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{project.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {[project.designerName, project.citySlug].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                </Link>
              ))}
            </section>
          ) : null}

          {suggestions.designers.length > 0 ? (
            <section aria-labelledby={`${listboxId}-designers`}>
              <p
                id={`${listboxId}-designers`}
                className="mt-1 border-t border-border px-2 pb-1 pt-2 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground"
              >
                Designers
              </p>
              {suggestions.designers.map((designer) => {
                const content = (
                  <>
                    {designer.logoUrl ? (
                      <img
                        src={designer.logoUrl}
                        alt=""
                        width={40}
                        height={40}
                        loading="lazy"
                        draggable={false}
                        className="size-10 rounded-full object-cover"
                      />
                    ) : (
                      <span
                        className="grid size-10 place-items-center rounded-full bg-muted text-xs font-medium"
                        aria-hidden
                      >
                        {designer.displayName.slice(0, 2).toUpperCase()}
                      </span>
                    )}
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {designer.displayName}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {designer.projectCount} projects
                      </span>
                    </span>
                  </>
                );

                return designer.slug ? (
                  <Link
                    key={designer.id}
                    href={`/d/${designer.slug}`}
                    role="option"
                    aria-selected="false"
                    className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-accent"
                  >
                    {content}
                  </Link>
                ) : (
                  <div
                    key={designer.id}
                    role="option"
                    aria-selected="false"
                    className="flex items-center gap-3 rounded-lg px-2 py-2"
                  >
                    {content}
                  </div>
                );
              })}
            </section>
          ) : null}

          {isLoading ? (
            <p className="px-3 py-4 text-center text-sm text-muted-foreground">Searching…</p>
          ) : !hasSuggestions ? (
            <p className="px-3 py-4 text-center text-sm text-muted-foreground">
              No suggestions found. Press Explore to search all projects.
            </p>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
