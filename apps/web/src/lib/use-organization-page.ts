'use client';

import { useEffect, useState } from 'react';
import type { OrganizationListQuery, OrganizationPage } from '@repo/contracts';

export function useOrganizationPage<T>({
  initialData,
  load,
  enabled = true,
  refreshKey,
}: {
  initialData: OrganizationPage<T>;
  load: (query: OrganizationListQuery, signal: AbortSignal) => Promise<OrganizationPage<T>>;
  enabled?: boolean;
  refreshKey?: unknown;
}) {
  const [data, setData] = useState(initialData);
  const [search, updateSearch] = useState('');
  const [page, setPage] = useState(initialData.page);
  const [limit, updateLimit] = useState(initialData.limit);
  const [revision, setRevision] = useState(0);
  const [isLoading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    const timer = setTimeout(
      () => {
        void load({ page, limit, q: search.trim() }, controller.signal)
          .then((result) => {
            if (controller.signal.aborted) return;
            setData(result);
            setPage(result.page);
          })
          .catch((cause: unknown) => {
            if (!controller.signal.aborted)
              setError(cause instanceof Error ? cause.message : 'Could not load the list.');
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
  }, [enabled, load, page, limit, search, revision, refreshKey]);

  let visibleData = data;
  if (!enabled) {
    const q = search.trim().toLowerCase();
    const items = initialData.items.filter((item) => {
      const record = item as { name?: string; email?: string };
      return [record.name, record.email].some((value) => value?.toLowerCase().includes(q));
    });
    const totalPages = Math.max(1, Math.ceil(items.length / limit));
    const currentPage = Math.min(page, totalPages);
    visibleData = {
      ...initialData,
      items: items.slice((currentPage - 1) * limit, currentPage * limit),
      total: items.length,
      totalPages,
      page: currentPage,
      limit,
    };
  }

  return {
    data: visibleData,
    search,
    setSearch: (value: string) => {
      updateSearch(value);
      setPage(1);
    },
    setPage,
    setLimit: (value: number) => {
      updateLimit(value);
      setPage(1);
    },
    isLoading: enabled && isLoading,
    error: enabled ? error : null,
    reload: () => setRevision((value) => value + 1),
  };
}
