import Link from 'next/link';
import type { ProjectHit, DesignerHit } from '@repo/contracts';
import { searchProjectsResponseSchema, searchDesignersResponseSchema } from '@repo/contracts';
import { env } from '@/env';
import { AlertCircle, Image, MapPin, Star, User } from 'lucide-react';

interface SearchResultsProps {
  query: string;
  scope: 'projects' | 'designers';
  page: number;
  filters?: {
    budgetBandSlug?: string;
    citySlug?: string;
    bhkSlug?: string;
  };
}

type FetchResult<T> = { status: 'ok'; data: T } | { status: 'error' };

async function fetchProjectResults(q: string, page: number, filters?: SearchResultsProps['filters']): Promise<FetchResult<{ hits: ProjectHit[]; estimatedTotalHits: number; fallback: string; relaxedFilters: string[] }>> {
  try {
    const params = new URLSearchParams({ q, page: String(page), limit: '24' });
    if (filters?.budgetBandSlug) params.set('budgetBandSlug', filters.budgetBandSlug);
    if (filters?.citySlug) params.set('citySlug', filters.citySlug);
    if (filters?.bhkSlug) params.set('bhkSlug', filters.bhkSlug);
    const response = await fetch(`${env.NEXT_PUBLIC_API_URL}/api/search?${params}`, {
      cache: 'no-store',
    });
    if (!response.ok) return { status: 'error' };
    const payload = await response.json();
    const parsed = searchProjectsResponseSchema.safeParse(payload);
    if (!parsed.success) return { status: 'error' };
    return { status: 'ok', data: parsed.data };
  } catch {
    return { status: 'error' };
  }
}

async function fetchDesignerResults(q: string, page: number): Promise<FetchResult<{ hits: DesignerHit[]; estimatedTotalHits: number }>> {
  try {
    const params = new URLSearchParams({ q, page: String(page), limit: '24' });
    const response = await fetch(`${env.NEXT_PUBLIC_API_URL}/api/search/designers?${params}`, {
      cache: 'no-store',
    });
    if (!response.ok) return { status: 'error' };
    const payload = await response.json();
    const parsed = searchDesignersResponseSchema.safeParse(payload);
    if (!parsed.success) return { status: 'error' };
    return { status: 'ok', data: parsed.data };
  } catch {
    return { status: 'error' };
  }
}

export async function SearchResults({ query, scope, page, filters }: SearchResultsProps) {
  if (scope === 'designers') {
    const result = await fetchDesignerResults(query, page);
    if (result.status === 'error') return <ErrorState />;
    if (result.data.hits.length === 0) return <EmptyState query={query} scope={scope} />;
    return (
      <div>
        <ResultsHeader count={result.data.estimatedTotalHits} query={query} scope={scope} />
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {result.data.hits.map((designer) => (
            <DesignerCard key={designer.id} designer={designer} />
          ))}
        </div>
        <Pagination page={page} hasMore={result.data.hits.length === 24} query={query} scope={scope} />
      </div>
    );
  }

  const result = await fetchProjectResults(query, page, filters);
  if (result.status === 'error') return <ErrorState />;
  if (result.data.hits.length === 0) return <EmptyState query={query} scope={scope} />;

  return (
    <div>
      <ResultsHeader count={result.data.estimatedTotalHits} query={query} scope={scope} />
      {result.data.fallback !== 'none' && (
        <p className="mt-1 text-xs text-muted-foreground">
          {result.data.fallback === 'relaxed' && 'Showing results with relaxed filters.'}
          {result.data.fallback === 'recent_in_city' && 'Showing recent projects in your city.'}
        </p>
      )}
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {result.data.hits.map((project) => (
          <ProjectCard key={project.id} project={project} />
        ))}
      </div>
      <Pagination page={page} hasMore={result.data.hits.length === 24} query={query} scope={scope} />
    </div>
  );
}

function ResultsHeader({
  count,
  query,
  scope,
}: {
  count: number;
  query: string;
  scope: string;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <h1 className="text-lg font-medium text-foreground">
        {count.toLocaleString()} {scope === 'designers' ? 'designer' : 'project'}
        {count !== 1 ? 's' : ''} found
      </h1>
      <span className="text-sm text-muted-foreground">for &ldquo;{query}&rdquo;</span>
    </div>
  );
}

function EmptyState({ query, scope }: { query: string; scope: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <p className="text-sm text-muted-foreground">
        No {scope} found for &ldquo;{query}&rdquo;.
      </p>
      <p className="mt-1 text-xs text-muted-foreground">Try a different search term or filter.</p>
    </div>
  );
}

function ErrorState() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-20">
      <AlertCircle className="size-5 text-destructive" aria-hidden />
      <p className="text-sm text-muted-foreground">
        Something went wrong. Please try again.
      </p>
    </div>
  );
}

function ProjectCard({ project }: { project: ProjectHit }) {
  return (
    <Link
      href={`/projects/${project.slug}`}
      className="group overflow-hidden rounded-xl border border-border bg-card transition-shadow hover:shadow-md"
    >
      {project.coverImageUrl ? (
        <img
          src={project.coverImageUrl}
          alt={project.title}
          loading="lazy"
          className="aspect-[4/3] w-full object-cover"
        />
      ) : (
        <div className="flex aspect-[4/3] w-full items-center justify-center bg-muted">
          <Image className="size-8 text-muted-foreground" aria-hidden />
        </div>
      )}
      <div className="p-3">
        <h3 className="truncate text-sm font-medium text-foreground group-hover:text-primary">
          {project.title}
        </h3>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{project.designerName}</p>
        <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
          {project.citySlug && (
            <span className="inline-flex items-center gap-0.5">
              <MapPin className="size-3" aria-hidden />
              {project.citySlug}
            </span>
          )}
          {project.bhkSlug && <span>{project.bhkSlug}</span>}
          {project.budgetBandSlug && <span>{project.budgetBandSlug}</span>}
        </div>
      </div>
    </Link>
  );
}

function DesignerCard({ designer }: { designer: DesignerHit }) {
  const href = designer.slug ? `/d/${designer.slug}` : '#';
  return (
    <Link
      href={href}
      className="group flex items-start gap-3 rounded-xl border border-border bg-card p-4 transition-shadow hover:shadow-md"
    >
      <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-muted">
        {designer.logoUrl ? (
          <img
            src={designer.logoUrl}
            alt=""
            className="size-12 rounded-full object-cover"
          />
        ) : (
          <User className="size-5 text-muted-foreground" aria-hidden />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-sm font-medium text-foreground group-hover:text-primary">
          {designer.displayName}
        </h3>
        {designer.bio && (
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{designer.bio}</p>
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {designer.avgRating > 0 && (
            <span className="inline-flex items-center gap-0.5">
              <Star className="size-3 fill-primary text-primary" aria-hidden />
              {designer.avgRating.toFixed(1)}
            </span>
          )}
          <span>{designer.projectCount} project{designer.projectCount !== 1 ? 's' : ''}</span>
          {designer.citySlugs.length > 0 && (
            <span className="inline-flex items-center gap-0.5">
              <MapPin className="size-3" aria-hidden />
              {designer.citySlugs[0]}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

function Pagination({
  page,
  hasMore,
  query,
  scope,
}: {
  page: number;
  hasMore: boolean;
  query: string;
  scope: string;
}) {
  if (page === 1 && !hasMore) return null;

  return (
    <div className="mt-8 flex items-center justify-center gap-4">
      {page > 1 && (
        <Link
          href={`/search?q=${encodeURIComponent(query)}&scope=${scope}&page=${page - 1}`}
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
        >
          Previous
        </Link>
      )}
      <span className="text-sm text-muted-foreground">Page {page}</span>
      {hasMore && (
        <Link
          href={`/search?q=${encodeURIComponent(query)}&scope=${scope}&page=${page + 1}`}
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
        >
          Next
        </Link>
      )}
    </div>
  );
}
