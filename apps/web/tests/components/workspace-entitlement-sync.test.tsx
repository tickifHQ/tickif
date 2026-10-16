import { useEffect } from 'react';
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SubscriptionResponse, SubscriptionState, PlanTier } from '@repo/contracts';
import {
  WorkspaceEntitlementSync,
  useWorkspaceEntitlementSync,
} from '@/components/workspace-entitlement-sync';

const mocks = vi.hoisted(() => ({ router: { refresh: vi.fn() } }));
vi.mock('next/navigation', () => ({ useRouter: () => mocks.router }));

type Snapshot = Pick<SubscriptionResponse, 'tier' | 'lifecycleState'>;
let synchronize: ReturnType<typeof useWorkspaceEntitlementSync>;
function Observer({ organizationId, snapshot }: { organizationId: string; snapshot: Snapshot }) {
  synchronize = useWorkspaceEntitlementSync();
  useEffect(() => synchronize(organizationId, snapshot), [organizationId, snapshot, synchronize]);
  return <button>Checkout remains mounted</button>;
}

function workspace(
  snapshot: Snapshot,
  {
    organizationId = 'org-1',
    planTier = 'hobby',
    subscriptionState = 'active',
    observedOrganizationId = organizationId,
  }: {
    organizationId?: string;
    planTier?: PlanTier;
    subscriptionState?: SubscriptionState;
    observedOrganizationId?: string;
  } = {},
) {
  return (
    <WorkspaceEntitlementSync
      organizationId={organizationId}
      planTier={planTier}
      subscriptionState={subscriptionState}
    >
      <Observer organizationId={observedOrganizationId} snapshot={snapshot} />
    </WorkspaceEntitlementSync>
  );
}

beforeEach(() => mocks.router.refresh.mockClear());
afterEach(() => vi.useRealTimers());

describe('workspace entitlement synchronization', () => {
  it('does not suppress a second upgrade after the server acknowledges an intervening downgrade', () => {
    const view = render(workspace({ tier: 'corporate', lifecycleState: 'active' }));
    view.rerender(
      workspace({ tier: 'corporate', lifecycleState: 'active' }, { planTier: 'corporate' }),
    );
    view.rerender(workspace({ tier: 'hobby', lifecycleState: 'active' }));
    view.rerender(workspace({ tier: 'corporate', lifecycleState: 'active' }));
    expect(mocks.router.refresh).toHaveBeenCalledTimes(2);
  });
  it('retries a failed or unchanged layout refresh on a later poll with bounded backoff', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-17T00:00:00Z'));
    const view = render(workspace({ tier: 'corporate', lifecycleState: 'active' }));
    expect(mocks.router.refresh).toHaveBeenCalledTimes(1);
    view.rerender(workspace({ tier: 'corporate', lifecycleState: 'active' }));
    expect(mocks.router.refresh).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(30_000);
    view.rerender(workspace({ tier: 'corporate', lifecycleState: 'active' }));
    expect(mocks.router.refresh).toHaveBeenCalledTimes(2);
    view.rerender(
      workspace({ tier: 'corporate', lifecycleState: 'active' }, { planTier: 'corporate' }),
    );
    vi.advanceTimersByTime(30_000);
    view.rerender(
      workspace({ tier: 'corporate', lifecycleState: 'active' }, { planTier: 'corporate' }),
    );
    expect(mocks.router.refresh).toHaveBeenCalledTimes(2);
  });
  it('refreshes retained server permissions after a confirmed upgrade without unmounting checkout', () => {
    const view = render(workspace({ tier: 'hobby', lifecycleState: 'active' }));
    const checkout = view.getByRole('button');
    expect(mocks.router.refresh).not.toHaveBeenCalled();
    view.rerender(workspace({ tier: 'corporate', lifecycleState: 'active' }));
    expect(mocks.router.refresh).toHaveBeenCalledTimes(1);
    expect(view.getByRole('button')).toBe(checkout);
  });

  it('deduplicates polling and accepts later downgrade, suspension and recovery changes', () => {
    const view = render(workspace({ tier: 'corporate', lifecycleState: 'active' }));
    view.rerender(workspace({ tier: 'corporate', lifecycleState: 'active' }));
    expect(mocks.router.refresh).toHaveBeenCalledTimes(1);
    view.rerender(
      workspace({ tier: 'corporate', lifecycleState: 'active' }, { planTier: 'corporate' }),
    );
    expect(mocks.router.refresh).toHaveBeenCalledTimes(1);
    view.rerender(
      workspace({ tier: 'corporate', lifecycleState: 'locked' }, { planTier: 'corporate' }),
    );
    expect(mocks.router.refresh).toHaveBeenCalledTimes(2);
    view.rerender(
      workspace(
        { tier: 'corporate', lifecycleState: 'active' },
        { planTier: 'corporate', subscriptionState: 'locked' },
      ),
    );
    expect(mocks.router.refresh).toHaveBeenCalledTimes(3);
    view.rerender(
      workspace({ tier: 'hobby', lifecycleState: 'downgraded' }, { planTier: 'corporate' }),
    );
    expect(mocks.router.refresh).toHaveBeenCalledTimes(4);
  });

  it('keeps current access for unpaid or scheduled targets while the effective subscription stays unchanged', () => {
    const view = render(workspace({ tier: 'hobby', lifecycleState: 'active' }));
    view.rerender(workspace({ tier: 'hobby', lifecycleState: 'active' }));
    expect(mocks.router.refresh).not.toHaveBeenCalled();
  });

  it('ignores missing or other-organization scope and late callbacks from a previous workspace', () => {
    const view = render(
      workspace(
        { tier: 'corporate', lifecycleState: 'active' },
        { observedOrganizationId: 'org-2' },
      ),
    );
    const previousCallback = synchronize;
    act(() => synchronize(null, { tier: 'corporate', lifecycleState: 'active' }));
    expect(mocks.router.refresh).not.toHaveBeenCalled();
    view.rerender(
      workspace({ tier: 'hobby', lifecycleState: 'active' }, { organizationId: 'org-2' }),
    );
    act(() => previousCallback('org-1', { tier: 'corporate', lifecycleState: 'active' }));
    expect(mocks.router.refresh).not.toHaveBeenCalled();
    act(() => synchronize('org-2', { tier: 'corporate', lifecycleState: 'active' }));
    expect(mocks.router.refresh).toHaveBeenCalledTimes(1);
  });

  it('is safe outside the designer workspace', () => {
    render(
      <Observer
        organizationId="org-1"
        snapshot={{ tier: 'corporate', lifecycleState: 'active' }}
      />,
    );
    expect(mocks.router.refresh).not.toHaveBeenCalled();
  });
});
