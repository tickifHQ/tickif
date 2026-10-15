'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { followingStateSchema } from '@repo/contracts';
import { Button, type ButtonVariantProps } from '@repo/ui/components/button';
import { UserCheck, UserPlus } from 'lucide-react';
import { api } from '@/lib/api';
import { authClient } from '@/lib/auth-client';
import { useHydrated } from '@/lib/use-hydrated';
import { ActionLoginDialog } from '@/components/action-login-dialog';
import { refreshVisitorHomeActivity } from '@/lib/visitor-activity.actions';

type FollowDesignerButtonProps = {
  designerProfileId: string;
  designerName: string;
  loginHref: string;
  size?: ButtonVariantProps['size'];
  className?: string;
};

function useFollowDesignerState(designerProfileId: string) {
  const { data: session, isPending } = authClient.useSession();
  const hydrated = useHydrated();
  const key = session ? `${session.user.id}:${designerProfileId}` : null;
  const [state, setState] = useState<{ key: string; following: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const currentScope = useRef<string | null>(null);

  useEffect(() => {
    currentScope.current = key;
    setBusy(false);
    setError(null);
    if (!key) return;
    const controller = new AbortController();
    void api.api.following[':designerProfileId']
      .$get(
        { param: { designerProfileId } },
        { init: { signal: controller.signal, cache: 'no-store' } },
      )
      .then(async (response) => {
        if (controller.signal.aborted) return;
        if (response.status === 403 || response.status === 404) {
          setUnavailable(key);
          return;
        }
        if (!response.ok) throw new Error('Could not load follow state.');
        const parsed = followingStateSchema.safeParse(await response.json());
        if (!parsed.success || parsed.data.designerProfileId !== designerProfileId)
          throw new Error('Invalid follow state.');
        if (!controller.signal.aborted) setState({ key, following: parsed.data.following });
      })
      .catch(() => {
        if (!controller.signal.aborted) setError('Could not load follow state.');
      });
    return () => {
      controller.abort();
      if (currentScope.current === key) currentScope.current = null;
    };
  }, [key, designerProfileId, retry]);

  const following = key !== null && state?.key === key && state.following;

  async function toggle() {
    if (!session) return;
    if (!key || state?.key !== key || busy) return;
    const mutationKey = key;
    setBusy(true);
    setError(null);
    try {
      const endpoint = api.api.following[':designerProfileId'];
      const response = following
        ? await endpoint.$delete({ param: { designerProfileId } })
        : await endpoint.$put({ param: { designerProfileId } });
      if (!response.ok) throw new Error('Follow update failed.');
      const parsed = followingStateSchema.safeParse(await response.json());
      if (!parsed.success || parsed.data.designerProfileId !== designerProfileId)
        throw new Error('Invalid follow response.');
      if (currentScope.current === mutationKey)
        setState({ key: mutationKey, following: parsed.data.following });
      // Navigation can unmount the control before a confirmed write finishes.
      // The home rail still needs its account-scoped refresh notification.
      window.dispatchEvent(
        new CustomEvent('tickif:following-changed', { detail: { userId: session.user.id } }),
      );
      // Invalidate cached home routes as well as mounted client counts. The API
      // has already confirmed the write, so cache invalidation is best effort.
      void refreshVisitorHomeActivity().catch(() => {});
    } catch {
      if (currentScope.current === mutationKey)
        setError('Could not update following. Please try again.');
    } finally {
      if (currentScope.current === mutationKey) setBusy(false);
    }
  }

  return {
    designerProfileId,
    following,
    busy,
    error,
    anonymous: !session,
    unavailable: !!key && unavailable === key,
    disabled: !hydrated || isPending || busy || (!!key && state?.key !== key),
    canRetry: !!key && state?.key !== key,
    retry: () => setRetry((value) => value + 1),
    toggle,
  };
}

const FollowDesignerContext = createContext<ReturnType<typeof useFollowDesignerState> | null>(null);

/** One account-scoped read and mutation state serves all controls on a portfolio. */
export function FollowDesignerProvider({
  designerProfileId,
  children,
}: {
  designerProfileId: string;
  children: ReactNode;
}) {
  const state = useFollowDesignerState(designerProfileId);
  return <FollowDesignerContext value={state}>{children}</FollowDesignerContext>;
}

export function FollowDesignerButton(props: FollowDesignerButtonProps) {
  const shared = useContext(FollowDesignerContext);
  return shared?.designerProfileId === props.designerProfileId ? (
    <FollowDesignerControl {...props} state={shared} />
  ) : (
    <StandaloneFollowDesignerButton {...props} />
  );
}

function StandaloneFollowDesignerButton(props: FollowDesignerButtonProps) {
  const state = useFollowDesignerState(props.designerProfileId);
  return <FollowDesignerControl {...props} state={state} />;
}

function FollowDesignerControl({
  designerName,
  loginHref,
  size,
  className,
  state,
}: FollowDesignerButtonProps & { state: ReturnType<typeof useFollowDesignerState> }) {
  const [loginOpen, setLoginOpen] = useState(false);
  const { following, busy, error } = state;
  if (state.unavailable) return null;

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <Button
        type="button"
        variant={following ? 'project-save' : 'outline'}
        size={size ?? (following ? 'project-save' : 'sm')}
        className={className}
        aria-label={`${following ? 'Unfollow' : 'Follow'} ${designerName}`}
        aria-pressed={following}
        aria-busy={busy}
        disabled={state.disabled}
        onClick={() => (state.anonymous ? setLoginOpen(true) : void state.toggle())}
      >
        {following ? (
          <UserCheck aria-hidden data-icon="inline-start" />
        ) : (
          <UserPlus aria-hidden data-icon="inline-start" />
        )}
        {following ? 'Following' : 'Follow'}
      </Button>
      {error ? (
        <p role="status" className="max-w-40 text-xs text-destructive">
          {error}{' '}
          {state.canRetry ? (
            <Button type="button" variant="link" size="xs" onClick={state.retry}>
              Retry
            </Button>
          ) : null}
        </p>
      ) : null}
      <ActionLoginDialog open={loginOpen} onOpenChange={setLoginOpen} loginHref={loginHref} />
    </div>
  );
}
