'use client';

import Link from 'next/link';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { followingListSchema, type FollowingList } from '@repo/contracts';
import { Button } from '@repo/ui/components/button';
import { Plus } from 'lucide-react';
import { Badge } from '@repo/ui/components/badge';
import { Skeleton } from '@repo/ui/components/skeleton';
import { cn } from '@repo/ui/lib/utils';
import { DesignerLogoAvatar } from '@/components/designer-logo-avatar';
import { InitialsAvatar } from '@/components/initials-avatar';
import { api } from '@/lib/api';
import { authClient } from '@/lib/auth-client';
import { useHydrated } from '@/lib/use-hydrated';
import { typography } from '@repo/ui/lib/typography';
import { VisitorHomeLoadError } from '@/components/visitor-home-load-error';

const FollowingContext = createContext<{
  data: FollowingList | null;
  failed: boolean;
  retry: () => void;
} | null>(null);

/** One account-scoped request serves both the avatar rail and the feed count. */
export function FollowingProvider({
  initialData,
  userId,
  page = 1,
  children,
}: {
  initialData: FollowingList | null;
  userId: string;
  page?: number;
  children: ReactNode;
}) {
  const hydrated = useHydrated();
  const { data: session } = authClient.useSession();
  const actorId = session?.user.id;
  const [resolved, setResolved] = useState({ actorId: userId, data: initialData });
  const [retry, setRetry] = useState(0);
  const [failed, setFailed] = useState(!initialData);
  useEffect(() => {
    setResolved((current) =>
      current.actorId === userId && !initialData ? current : { actorId: userId, data: initialData },
    );
  }, [initialData, userId]);
  useEffect(() => {
    if (!actorId || !hydrated) return;
    const controller = new AbortController();
    setFailed(false);
    void api.api.following
      .$get(
        { query: { page, limit: 20 } },
        { init: { cache: 'no-store', signal: controller.signal } },
      )
      .then(async (response) => {
        if (!response.ok) throw new Error('Following unavailable');
        const parsed = followingListSchema.safeParse(await response.json());
        if (!parsed.success) throw new Error('Invalid following response');
        if (!controller.signal.aborted) setResolved({ actorId, data: parsed.data });
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [actorId, hydrated, page, retry, initialData, userId]);
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') setRetry((value) => value + 1);
    };
    const changed = (event: Event) => {
      if (event instanceof CustomEvent && event.detail?.userId === actorId) refresh();
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('tickif:following-changed', changed);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('tickif:following-changed', changed);
    };
  }, [actorId]);
  const data = hydrated && resolved.actorId !== actorId ? null : resolved.data;
  return (
    <FollowingContext value={{ data, failed, retry: () => setRetry((value) => value + 1) }}>
      {children}
    </FollowingContext>
  );
}

export function FollowingFeedTab({ active = false }: { active?: boolean }) {
  const shared = useContext(FollowingContext);
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const actorId = session?.user.id;
  useEffect(() => {
    if (!active || !actorId) return;
    const refresh = () => {
      if (document.visibilityState === 'visible') router.refresh();
    };
    const changed = (event: Event) => {
      if (event instanceof CustomEvent && event.detail?.userId === actorId) refresh();
    };
    window.addEventListener('focus', refresh);
    window.addEventListener('tickif:following-changed', changed);
    return () => {
      window.removeEventListener('focus', refresh);
      window.removeEventListener('tickif:following-changed', changed);
    };
  }, [active, actorId, router]);
  return (
    <Button asChild variant="discovery-tab" size="discovery-tab" className="shrink-0">
      <Link
        href="/home?feed=custom&view=following"
        prefetch={false}
        aria-current={active ? 'page' : undefined}
      >
        Following
        {shared?.data ? (
          <span
            className={cn(
              typography.monoMd,
              'tabular-nums',
              active ? 'text-background/80' : 'text-muted-foreground',
            )}
          >
            {shared.data.total}
          </span>
        ) : null}
      </Link>
    </Button>
  );
}

export function FollowingRail({
  initialData,
  userId,
  page = 1,
  standalone = false,
}: {
  initialData: FollowingList;
  userId: string;
  page?: number;
  standalone?: boolean;
}) {
  return (
    <FollowingProvider initialData={initialData} userId={userId} page={page}>
      <FollowingStudios page={page} standalone={standalone} />
    </FollowingProvider>
  );
}

export function FollowingStudios({
  page = 1,
  standalone = false,
}: {
  page?: number;
  standalone?: boolean;
}) {
  const shared = useContext(FollowingContext);
  if (!shared?.data)
    return shared?.failed ? (
      <VisitorHomeLoadError
        title="Following unavailable"
        message="We could not load your followed studios. Please try again."
      />
    ) : (
      <Skeleton className="h-28 w-full" />
    );
  const { data, failed } = shared;
  return (
    <section aria-label="Studios you follow" className="flex flex-col gap-4">
      {failed ? (
        <div role="status" className="flex flex-wrap items-center gap-2 text-xs text-destructive">
          Could not refresh followed studios.
          <Button type="button" variant="link" size="xs" onClick={shared.retry}>
            Retry
          </Button>
        </div>
      ) : null}
      {/* Reserve the optional count-caption row so clearing NEW never moves the feed. */}
      <div
        className={cn(
          'flex min-w-0 items-start gap-5 overflow-x-auto px-0.5 py-1',
          standalone && 'flex-wrap',
        )}
      >
        {data.items.map((studio) => {
          const contents = (
            <>
              <span
                className={cn(
                  'rounded-full border p-0.75',
                  studio.newProjectCount > 0 ? 'border-2 border-primary' : 'border-border',
                )}
              >
                <DesignerLogoAvatar
                  logoUrl={studio.logoUrl}
                  alt=""
                  sizePx={56}
                  className="size-14 border-2 border-card"
                  fallback={
                    <InitialsAvatar
                      seed={studio.displayName}
                      fallbackSeed="Studio"
                      alt=""
                      size={56}
                    />
                  }
                />
              </span>
              <span title={studio.displayName} className="max-w-28 truncate text-center text-xs">
                {studio.displayName}
              </span>
              {studio.newProjectCount > 0 ? (
                <Badge variant="text" size="text" textStyle="code">
                  {studio.newProjectCount} NEW
                </Badge>
              ) : null}
            </>
          );
          return studio.portfolioAvailable ? (
            <Link
              key={studio.designerProfileId}
              href={`/d/${encodeURIComponent(studio.slug)}`}
              className="flex min-h-28.5 min-w-16 shrink-0 flex-col items-center gap-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`${studio.displayName}${studio.newProjectCount ? `, ${studio.newProjectCount} new projects` : ''}`}
            >
              {contents}
            </Link>
          ) : (
            <div
              key={studio.designerProfileId}
              className="flex min-h-28.5 min-w-16 shrink-0 flex-col items-center gap-2"
            >
              {contents}
              <span className="text-center text-xs text-muted-foreground">
                Portfolio unavailable
              </span>
            </div>
          );
        })}
        <Link
          href="/designers"
          className="flex min-h-28.5 shrink-0 flex-col items-center gap-2 rounded-lg text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="grid size-15.5 place-items-center rounded-full border border-dashed border-border-strong">
            <Plus className="size-4.5" aria-hidden />
          </span>
          <span className="text-xs">Find designers</span>
        </Link>
      </div>
      {data.total > data.items.length && !standalone ? (
        <Link
          href="/home/following"
          className="text-xs text-primary underline-offset-4 hover:underline"
        >
          View all following ({data.total})
        </Link>
      ) : null}
      {standalone ? (
        <nav aria-label="Following pages" className="flex gap-4 text-sm">
          {page > 1 ? <Link href={`/home/following?page=${page - 1}`}>Previous</Link> : null}
          {page < data.totalPages ? (
            <Link href={`/home/following?page=${page + 1}`}>Next</Link>
          ) : null}
        </nav>
      ) : null}
    </section>
  );
}
