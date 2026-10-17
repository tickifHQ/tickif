'use client';

import { useEffect, useState } from 'react';
import type { OrganizationListQuery, OrganizationPage } from '@repo/contracts';

/** Searchable dropdown pages accumulate so earlier options remain selectable while loading more. */
export function useOrganizationOptions<T extends { id: string; name: string; email: string }>({
  initialItems,
  load,
  enabled,
  refreshKey,
}: {
  initialItems: T[];
  load: (query: OrganizationListQuery, signal: AbortSignal) => Promise<OrganizationPage<T>>;
  enabled: boolean;
  refreshKey?: unknown;
}) {
  const [cache, setCache] = useState({ refreshKey, items: initialItems, totalPages: 1 });
  const [search, updateSearch] = useState('');
  const [request, setRequest] = useState({ refreshKey, page: 1, revision: 0 });
  const currentRequest = Object.is(request.refreshKey, refreshKey)
    ? request
    : { refreshKey, page: 1, revision: 0 };
  const { page, revision } = currentRequest;
  const cacheMatches = Object.is(cache.refreshKey, refreshKey);
  const items = cacheMatches ? cache.items : [];
  const totalPages = cacheMatches ? cache.totalPages : 1;
  const [isLoading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    setCache((previous) =>
      Object.is(previous.refreshKey, refreshKey)
        ? previous
        : { refreshKey, items: [], totalPages: 1 },
    );
    setLoading(true);
    setError(null);
    const timer = setTimeout(
      () => {
        void load({ page, limit: 12, q: search.trim() }, controller.signal)
          .then((result) => {
            if (controller.signal.aborted) return;
            if (result.page !== page) {
              setCache({ refreshKey, items: [], totalPages: 1 });
              setRequest({ refreshKey, page: 1, revision: revision + 1 });
              return;
            }
            setCache((previous) => ({
              refreshKey,
              items:
                page === 1 || !Object.is(previous.refreshKey, refreshKey)
                  ? result.items
                  : Array.from(
                      new Map(
                        [...previous.items, ...result.items].map((item) => [item.id, item]),
                      ).values(),
                    ),
              totalPages: result.totalPages,
            }));
          })
          .catch((cause: unknown) => {
            if (!controller.signal.aborted)
              setError(cause instanceof Error ? cause.message : 'Could not load options.');
          })
          .finally(() => {
            if (!controller.signal.aborted) setLoading(false);
          });
      },
      search ? 250 : 0,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [enabled, load, page, search, revision, refreshKey]);

  const query = search.trim().toLowerCase();
  return {
    items: enabled
      ? items
      : initialItems.filter(
          (item) =>
            item.name.toLowerCase().includes(query) || item.email.toLowerCase().includes(query),
        ),
    search,
    setSearch: (value: string) => {
      if (value === search) return;
      updateSearch(value);
      setRequest({ refreshKey, page: 1, revision });
      setCache({ refreshKey, items: [], totalPages: 1 });
      setError(null);
    },
    isLoading: enabled && (isLoading || !cacheMatches),
    error: enabled && cacheMatches ? error : null,
    hasMore: enabled && page < totalPages,
    loadMore: () => {
      if (!isLoading && !error && page < totalPages)
        setRequest({ refreshKey, page: page + 1, revision });
    },
    reload: () => {
      setRequest({ refreshKey, page: 1, revision: revision + 1 });
      setCache({ refreshKey, items: [], totalPages: 1 });
    },
  };
}
