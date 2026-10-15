'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';
import { listSavedProjectsResponseSchema, savedProjectStateSchema } from '@repo/contracts';
import { Badge } from '@repo/ui/components/badge';
import { Button } from '@repo/ui/components/button';
import { api } from '@/lib/api';
import { handleApiResponse } from '@/lib/api-response';

const SavedCountContext = createContext<{
  total: number | null | undefined;
  failed: boolean;
  retry: () => void;
}>({ total: undefined, failed: false, retry: () => undefined });

/** One account-scoped listener serves both desktop and mobile activity links. */
export function VisitorSavedCountProvider({
  userId,
  children,
}: {
  userId: string;
  children: ReactNode;
}) {
  const [result, setResult] = useState<{
    userId: string;
    total: number | null;
    failed: boolean;
  } | null>(null);
  const retry = useRef<(() => void) | null>(null);
  const current = result?.userId === userId ? result : null;

  useEffect(() => {
    let controller: AbortController | null = null;
    function refreshCount() {
      controller?.abort();
      const request = new AbortController();
      controller = request;
      void api.api['saved-projects']
        .$get(
          { query: { page: 1, limit: 1 } },
          { init: { cache: 'no-store', signal: request.signal } },
        )
        .then((response) =>
          handleApiResponse(
            response,
            listSavedProjectsResponseSchema,
            'Could not load saved count.',
          ),
        )
        .then((data) => {
          if (!request.signal.aborted) setResult({ userId, total: data.total, failed: false });
        })
        .catch(() => {
          if (!request.signal.aborted) setResult({ userId, total: null, failed: true });
        });
    }
    function onSaved(event: Event) {
      if (!(event instanceof CustomEvent) || event.detail?.userId !== userId) return;
      if (savedProjectStateSchema.safeParse(event.detail?.project).success) refreshCount();
    }
    retry.current = refreshCount;
    window.addEventListener('tickif:project-saved', onSaved);
    return () => {
      controller?.abort();
      retry.current = null;
      window.removeEventListener('tickif:project-saved', onSaved);
    };
  }, [userId]);

  return (
    <SavedCountContext
      value={{
        total: current?.total,
        failed: current?.failed ?? false,
        retry: () => retry.current?.(),
      }}
    >
      {children}
      <p role="status" className="sr-only">
        {current?.failed
          ? 'Saved projects updated, but the saved count is unavailable. Retry the saved count.'
          : ''}
      </p>
    </SavedCountContext>
  );
}

export function VisitorSavedCount({
  initialTotal,
  navigation = false,
}: {
  initialTotal: number | null;
  navigation?: boolean;
}) {
  const { total } = useContext(SavedCountContext);
  const count = total === undefined ? initialTotal : total;
  return count === null ? null : (
    <Badge variant="contrast" size={navigation ? 'navigation' : 'default'}>
      {count}
    </Badge>
  );
}

export function VisitorSavedCountRetry() {
  const { failed, retry } = useContext(SavedCountContext);
  if (!failed) return null;
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label="Retry saved count"
      title="Saved count unavailable. Retry."
      onClick={(event) => {
        event.currentTarget.closest('nav')?.querySelector('a')?.focus();
        retry();
      }}
    >
      <RefreshCw aria-hidden data-icon="inline-start" />
    </Button>
  );
}
