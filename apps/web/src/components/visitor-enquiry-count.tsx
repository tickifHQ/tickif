'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';
import { enquiryCountsSchema, type EnquiryCounts } from '@repo/contracts';
import { Badge } from '@repo/ui/components/badge';
import { Button } from '@repo/ui/components/button';
import { api } from '@/lib/api';
import { handleApiResponse } from '@/lib/api-response';
import { authClient } from '@/lib/auth-client';
import { useHydrated } from '@/lib/use-hydrated';

const EnquiryCountContext = createContext<{
  counts: EnquiryCounts | null | undefined;
  active: boolean;
  failed: boolean;
  retry: () => void;
}>({ counts: undefined, active: true, failed: false, retry: () => undefined });

/** One private count read serves both header layouts, without reloading the project feed. */
export function VisitorEnquiryCountProvider({
  userId,
  children,
}: {
  userId: string;
  children: ReactNode;
}) {
  const hydrated = useHydrated();
  const { data: session } = authClient.useSession();
  const actorId = session?.user.id;
  const active = !hydrated || actorId === userId;
  const [result, setResult] = useState<{
    userId: string;
    counts: EnquiryCounts | null;
    failed: boolean;
  } | null>(null);
  const retry = useRef<(() => void) | null>(null);
  const current = result?.userId === userId && active ? result : null;
  useEffect(() => {
    if (!hydrated || actorId !== userId) return;
    let controller: AbortController | null = null;
    let timeout: number | null = null;
    function refresh() {
      if (document.visibilityState !== 'visible') return;
      controller?.abort();
      if (timeout !== null) window.clearTimeout(timeout);
      const request = new AbortController();
      controller = request;
      const requestTimeout = window.setTimeout(() => {
        if (!request.signal.aborted) {
          request.abort();
          setResult({ userId, counts: null, failed: true });
        }
      }, 10000);
      timeout = requestTimeout;
      void api.api.enquiries.counts
        .$get({}, { init: { cache: 'no-store', signal: request.signal } })
        .then((response) =>
          handleApiResponse(response, enquiryCountsSchema, 'Could not load enquiry counts.'),
        )
        .then((counts) => {
          if (!request.signal.aborted) setResult({ userId, counts, failed: false });
        })
        .catch(() => {
          if (!request.signal.aborted) setResult({ userId, counts: null, failed: true });
        })
        .finally(() => window.clearTimeout(requestTimeout));
    }
    retry.current = refresh;
    refresh();
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    // Updates arrive through the existing HTTP API, with no polling in hidden tabs.
    const timer = window.setInterval(refresh, 30000);
    return () => {
      controller?.abort();
      if (timeout !== null) window.clearTimeout(timeout);
      retry.current = null;
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [actorId, hydrated, userId]);
  return (
    <EnquiryCountContext
      value={{
        counts: current?.counts,
        active,
        failed: current?.failed ?? false,
        retry: () => retry.current?.(),
      }}
    >
      {children}
      <p role="status" className="sr-only">
        {current?.failed
          ? 'Enquiry count is unavailable. Please retry.'
          : current?.counts != null
            ? `Enquiry count: ${current.counts.total}. ${current.counts.unread === 0 ? 'All enquiry updates are read.' : `Enquiries with unread updates: ${current.counts.unread}.`}`
            : ''}
      </p>
    </EnquiryCountContext>
  );
}

export function VisitorEnquiryCount({
  initialCounts,
  navigation = false,
}: {
  initialCounts: EnquiryCounts | null;
  navigation?: boolean;
}) {
  const { counts, active } = useContext(EnquiryCountContext);
  const count = counts === undefined ? initialCounts : counts;
  if (!active || count === null) return null;
  return (
    <Badge
      variant="terracotta"
      size={navigation ? 'navigation' : 'default'}
      textStyle={navigation ? 'default' : 'code'}
    >
      {count.total}
      {count.unread > 0 ? ' NEW' : null}
    </Badge>
  );
}

export function VisitorEnquiryCountRetry() {
  const { failed, retry } = useContext(EnquiryCountContext);
  if (!failed) return null;
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label="Retry enquiry count"
      onClick={(event) => {
        event.currentTarget
          .closest('nav')
          ?.querySelector<HTMLAnchorElement>('a[href="/enquiries"]')
          ?.focus();
        retry();
      }}
    >
      <RefreshCw aria-hidden data-icon="inline-start" />
    </Button>
  );
}
