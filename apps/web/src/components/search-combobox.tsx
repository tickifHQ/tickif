'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { SuggestProject, SuggestDesigner } from '@repo/contracts';
import { searchSuggestResponseSchema } from '@repo/contracts';
import { env } from '@/env';
import { Search, ArrowRight, User, Image, Loader2 } from 'lucide-react';

const DEBOUNCE_MS = 250;
const MIN_QUERY_LENGTH = 2;

type SearchScope = 'projects' | 'designers';

interface SearchComboboxProps {
  /** Visual variant: 'hero' for logged-out hero, 'bar' for logged-in search bar */
  variant?: 'hero' | 'bar';
  /** Placeholder text */
  placeholder?: string;
}

export function SearchCombobox({
  variant = 'bar',
  placeholder = 'Search by city, style, budget, room type…',
}: SearchComboboxProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<SearchScope>('projects');
  const [suggestions, setSuggestions] = useState<{
    projects: SuggestProject[];
    designers: SuggestDesigner[];
  }>({ projects: [], designers: [] });
  const [showDropdown, setShowDropdown] = useState(false);
  const [isPending, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Debounced suggest fetch
  const fetchSuggestions = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (q.length < MIN_QUERY_LENGTH) {
      setSuggestions({ projects: [], designers: [] });
      setShowDropdown(false);
      return;
    }

    debounceRef.current = setTimeout(() => {
      startTransition(async () => {
        try {
          const response = await fetch(
            `${env.NEXT_PUBLIC_API_URL}/api/search/suggest?q=${encodeURIComponent(q)}`,
            { credentials: 'include' },
          );
          if (!response.ok) return;
          const payload = await response.json();
          const parsed = searchSuggestResponseSchema.safeParse(payload);
          if (!parsed.success) return;
          setSuggestions({ projects: parsed.data.projects, designers: parsed.data.designers });
          setShowDropdown(true);
        } catch {
          // Silently fail
        }
      });
    }, DEBOUNCE_MS);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function handleInputChange(value: string) {
    setQuery(value);
    fetchSuggestions(value);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setShowDropdown(false);
    router.push(`/search?q=${encodeURIComponent(query.trim())}&scope=${scope}`);
  }

  function handleSuggestionClick(type: 'project' | 'designer', item: SuggestProject | SuggestDesigner) {
    setShowDropdown(false);
    if (type === 'project') {
      const project = item as SuggestProject;
      router.push(`/projects/${project.slug}`);
    } else {
      const designer = item as SuggestDesigner;
      if (designer.slug) {
        router.push(`/d/${designer.slug}`);
      }
    }
  }

  const isHero = variant === 'hero';
  const hasSuggestions = suggestions.projects.length > 0 || suggestions.designers.length > 0;

  return (
    <div ref={containerRef} className="relative w-full">
      <form onSubmit={handleSubmit} role="search">
        <div
          className={`flex items-center gap-3 rounded-xl border bg-background shadow-home-search ${
            isHero
              ? 'border-home-search-border bg-home-search-background py-1 pl-3.5 pr-1.5'
              : 'border-border py-1.5 pl-5 pr-1.5'
          }`}
        >
          <Search
            className={`size-4 shrink-0 ${isHero ? 'text-home-search-foreground-disabled' : 'text-primary'}`}
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(e) => handleInputChange(e.target.value)}
            onFocus={() => {
              if (hasSuggestions) setShowDropdown(true);
            }}
            placeholder={placeholder}
            aria-label="Search homes"
            aria-expanded={showDropdown}
            aria-haspopup="listbox"
            aria-busy={isPending}
            autoComplete="off"
            className={`h-9 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground ${
              isHero ? 'placeholder:text-home-search-foreground-disabled' : ''
            }`}
          />
          <div className="hidden shrink-0 items-center gap-2 sm:flex">
            {isPending && (
              <Loader2 className="size-3.5 animate-spin text-muted-foreground" aria-label="Loading suggestions" />
            )}
            <button
              type="button"
              onClick={() => setScope('projects')}
              className={`rounded-md border px-3.5 py-1.5 text-xs transition-colors ${
                scope === 'projects'
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-foreground hover:bg-accent'
              }`}
            >
              Projects
            </button>
            <button
              type="button"
              onClick={() => setScope('designers')}
              className={`rounded-md border px-3.5 py-1.5 text-xs transition-colors ${
                scope === 'designers'
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-foreground hover:bg-accent'
              }`}
            >
              Designers
            </button>
          </div>
          <button
            type="submit"
            className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-3 text-sm font-medium shadow-sm transition-colors ${
              isHero
                ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                : 'bg-foreground text-background hover:bg-foreground/90'
            }`}
          >
            Explore
            <ArrowRight className="size-4" aria-hidden />
          </button>
        </div>
      </form>

      {/* Autocomplete dropdown */}
      {showDropdown && hasSuggestions && (
        <div
          role="listbox"
          className="absolute top-full z-50 mt-2 w-full overflow-hidden rounded-xl border border-border bg-background shadow-lg"
        >
          {suggestions.projects.length > 0 && (
            <div className="border-b border-border px-3 py-2">
              <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Projects
              </p>
              {suggestions.projects.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  role="option"
                  onClick={() => handleSuggestionClick('project', project)}
                  className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm transition-colors hover:bg-accent"
                >
                  <Image className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-foreground">{project.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {project.designerName}
                      {project.citySlug && ` · ${project.citySlug}`}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {suggestions.designers.length > 0 && (
            <div className="px-3 py-2">
              <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Designers
              </p>
              {suggestions.designers.map((designer) => (
                <button
                  key={designer.id}
                  type="button"
                  role="option"
                  onClick={() => handleSuggestionClick('designer', designer)}
                  className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm transition-colors hover:bg-accent"
                >
                  <User className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-foreground">{designer.displayName}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {designer.projectCount} project{designer.projectCount !== 1 ? 's' : ''}
                      {designer.citySlugs.length > 0 && ` · ${designer.citySlugs[0]}`}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {query.trim().length >= MIN_QUERY_LENGTH && (
            <div className="border-t border-border px-3 py-2">
              <button
                type="button"
                onClick={() => {
                  setShowDropdown(false);
                  router.push(`/search?q=${encodeURIComponent(query.trim())}&scope=${scope}`);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-primary transition-colors hover:bg-accent"
              >
                <Search className="size-4" aria-hidden />
                Search for &ldquo;{query.trim()}&rdquo;
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
