'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { projectLikeStateSchema, projectLikesStateResponseSchema, type ProjectLikeState } from '@repo/contracts';
import { Button } from '@repo/ui/components/button';
import { Heart } from 'lucide-react';
import { api } from '@/lib/api';
import { authClient } from '@/lib/auth-client';

export function ProjectLikeButton({ projectId, loginHref }: { projectId: string; loginHref: string }) {
  const router = useRouter();
  const errorId = useId();
  const countId = useId();
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const stateKey = `${session?.user.id ?? 'anonymous'}:${projectId}`;
  const currentKey = useRef(stateKey);
  currentKey.current = stateKey;
  const requestPending = useRef(false);
  const [pending, setPending] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [resolved, setResolved] = useState<{ key: string; state: ProjectLikeState | null; error: string | null } | null>(null);
  const result = resolved?.key === stateKey ? resolved : null;
  const state = result?.state;

  useEffect(() => {
    if (sessionPending) return;
    let ignore = false;
    async function loadState() {
      try {
        const response = await api.api['project-likes'].state.$get({ query: { projectIds: projectId } });
        if (!response.ok) throw new Error('Could not load likes.');
        const parsed = projectLikesStateResponseSchema.safeParse(await response.json());
        if (!parsed.success) throw new Error('Invalid likes response.');
        const loaded = parsed.data.projects.find((item) => item.projectId === projectId);
        if (!loaded) throw new Error('This project is no longer available.');
        if (!ignore) setResolved({ key: stateKey, state: loaded, error: null });
      } catch (error) {
        if (!ignore) setResolved({ key: stateKey, state: null, error: error instanceof Error ? error.message : 'Could not load likes.' });
      }
    }
    void loadState();
    return () => { ignore = true; };
  }, [projectId, stateKey, sessionPending, attempt]);

  async function toggleLike() {
    if (sessionPending || requestPending.current) return;
    if (!session) { router.push(loginHref); return; }
    if (!state) { setResolved(null); setAttempt((value) => value + 1); return; }
    if (session.session.activeOrganizationId) {
      setResolved({ key: stateKey, state, error: 'Switch to your personal account to like projects.' });
      return;
    }
    requestPending.current = true;
    setPending(true);
    try {
      const response = state.liked
        ? await api.api['project-likes'][':projectId'].$delete({ param: { projectId } })
        : await api.api['project-likes'][':projectId'].$put({ param: { projectId } });
      if (currentKey.current !== stateKey) return;
      if (response.status === 401) { router.push(loginHref); return; }
      if (response.status === 403) throw new Error('Likes require an active account in personal context.');
      if (response.status === 404) throw new Error('This project is no longer available.');
      if (!response.ok) throw new Error('Could not update your like. Please try again.');
      const parsed = projectLikeStateSchema.safeParse(await response.json());
      if (!parsed.success) throw new Error('Could not update your like. Please try again.');
      if (currentKey.current === stateKey) setResolved({ key: stateKey, state: parsed.data, error: null });
    } catch (error) {
      if (currentKey.current === stateKey) setResolved({ key: stateKey, state, error: error instanceof Error ? error.message : 'Could not update your like. Please try again.' });
    } finally {
      requestPending.current = false;
      setPending(false);
    }
  }

  const label = state?.liked ? 'Unlike project' : 'Like project';
  return (
    <div className="flex flex-col gap-1">
      <Button type="button" variant={state?.liked ? 'default' : 'secondary'} size="compact"
        aria-label={!session && !sessionPending ? 'Sign in to like project' : result?.error && !state ? 'Retry loading likes' : label}
        aria-pressed={state?.liked ?? false} aria-busy={pending}
        aria-describedby={result?.error ? `${countId} ${errorId}` : countId}
        disabled={sessionPending || pending || (!!session && !result)} onClick={toggleLike}>
        <Heart aria-hidden data-icon="inline-start" fill={state?.liked ? 'currentColor' : 'none'} />
        {pending ? 'Updating…' : state?.liked ? 'Liked' : 'Like'}
        <span id={countId} aria-live="polite">{state ? state.likeCount : '…'}<span className="sr-only"> likes</span></span>
      </Button>
      {result?.error ? <p id={errorId} role="status" className="text-xs text-destructive">{result.error}</p> : null}
    </div>
  );
}
