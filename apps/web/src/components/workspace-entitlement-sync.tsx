'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useTransition,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import type { OrganizationWorkspaceResponse, SubscriptionResponse } from '@repo/contracts';

type WorkspacePlan = Pick<OrganizationWorkspaceResponse, 'planTier' | 'subscriptionState'>;
type Synchronize = (
  organizationId: string | null | undefined,
  subscription: Pick<SubscriptionResponse, 'tier' | 'lifecycleState'>,
) => void;
const EntitlementSyncContext = createContext<Synchronize>(() => undefined);

/** Refresh retained server permissions when billing observes a changed effective subscription. */
export function WorkspaceEntitlementSync(
  props: WorkspacePlan & { organizationId: string; children: ReactNode },
) {
  return <ScopedEntitlementSync key={props.organizationId} {...props} />;
}

function ScopedEntitlementSync({
  organizationId,
  planTier,
  subscriptionState,
  children,
}: WorkspacePlan & { organizationId: string; children: ReactNode }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const mounted = useRef(true);
  const requested = useRef<{ baseline: string; subscription: string; at: number } | null>(null);
  const baseline = JSON.stringify([planTier, subscriptionState]);
  useEffect(() => {
    if (requested.current?.baseline !== baseline) requested.current = null;
  }, [baseline]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const synchronize = useCallback<Synchronize>(
    (observedOrganizationId, subscription) => {
      if (!mounted.current || observedOrganizationId !== organizationId) return;
      // Only effective server data is compared: a selected/scheduled target is never access.
      const observed = JSON.stringify([subscription.tier, subscription.lifecycleState]);
      if (observed === baseline) return;
      // Retry on a later billing poll if an offline/failed refresh did not update the layout.
      if (
        requested.current?.baseline === baseline &&
        requested.current.subscription === observed &&
        Date.now() - requested.current.at < 30_000
      )
        return;
      requested.current = { baseline, subscription: observed, at: Date.now() };
      // Merge new layout props without tearing down the checkout or its provider callbacks.
      startTransition(() => router.refresh());
    },
    [baseline, organizationId, router],
  );
  return <EntitlementSyncContext value={synchronize}>{children}</EntitlementSyncContext>;
}

/** Call only with a successfully parsed, authoritative subscription response. */
export function useWorkspaceEntitlementSync() {
  return useContext(EntitlementSyncContext);
}
