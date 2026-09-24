import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ capabilities: vi.fn() }));
vi.mock('@/lib/auth-guard', () => ({
  requireAuth: vi.fn(async () => ({
    user: { id: 'user-a' },
    session: { activeOrganizationId: 'org-a' },
  })),
}));
vi.mock('@/lib/current-org-role', () => ({
  getCurrentOrgCapabilities: mocks.capabilities,
  hasBillingAccess: (value: { billing: boolean } | null) => value?.billing === true,
}));
vi.mock('@/components/subscribe/subscribe-page', () => ({
  SubscribePage: ({ userId, organizationId }: { userId: string; organizationId: string }) => (
    <div>
      {userId}:{organizationId}
    </div>
  ),
}));

import DesignerSubscribePage from '../../app/(designer)/designer/plan-billing/subscribe/page';

describe('Subscribe server billing permission guard', () => {
  it('denies billing visibility without capability', async () => {
    mocks.capabilities.mockResolvedValue({ billing: false });
    render(await DesignerSubscribePage());
    expect(screen.getByText('Billing access restricted')).toBeInTheDocument();
    expect(screen.queryByText('user-a:org-a')).not.toBeInTheDocument();
  });
  it('passes authenticated identity to the permitted billing page', async () => {
    mocks.capabilities.mockResolvedValue({ billing: true });
    render(await DesignerSubscribePage());
    expect(screen.getByText('user-a:org-a')).toBeInTheDocument();
  });
});
