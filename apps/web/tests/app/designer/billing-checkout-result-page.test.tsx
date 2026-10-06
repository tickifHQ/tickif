import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), capabilities: vi.fn(), notFound: vi.fn() }));
vi.mock('next/navigation', () => ({ notFound: mocks.notFound }));
vi.mock('@/lib/auth-guard', () => ({ requireAuth: mocks.auth }));
vi.mock('@/lib/current-org-role', () => ({
  getCurrentOrgCapabilities: mocks.capabilities,
  hasBillingAccess: (capabilities: { billing: boolean } | null) => capabilities?.billing === true,
}));
vi.mock('@/components/subscribe/checkout-result', () => ({
  CheckoutResult: (props: { outcome: string; targetTier: string; organizationId: string }) => (
    <div data-testid="checkout-result">{JSON.stringify(props)}</div>
  ),
}));
import Page from '../../../app/(designer)/designer/plan-billing/subscribe/[outcome]/page';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: 'owner' }, session: { activeOrganizationId: 'org' } });
  mocks.capabilities.mockResolvedValue({ billing: true });
  mocks.notFound.mockImplementation(() => {
    throw new Error('NEXT_NOT_FOUND');
  });
});

describe('checkout return route', () => {
  it.each(['complete', 'closed'])(
    'scopes a valid %s return to the authenticated organization',
    async (outcome) => {
      render(
        await Page({
          params: Promise.resolve({ outcome }),
          searchParams: Promise.resolve({ plan: 'corporate' }),
        }),
      );
      expect(screen.getByTestId('checkout-result')).toHaveTextContent(
        JSON.stringify({
          outcome,
          targetTier: 'corporate',
          userId: 'owner',
          organizationId: 'org',
        }),
      );
      expect(mocks.auth).toHaveBeenCalledWith({ requiredRole: 'designer' });
    },
  );
  it.each([
    { outcome: 'anything', plan: 'corporate' },
    { outcome: 'complete', plan: 'unknown' },
    { outcome: 'closed', plan: undefined },
    { outcome: 'complete', plan: ['corporate', 'professional_plus'] },
  ])('rejects invalid return parameters: %j', async ({ outcome, plan }) => {
    await expect(
      Page({ params: Promise.resolve({ outcome }), searchParams: Promise.resolve({ plan }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND');
  });
  it('denies billing access after permissions are revoked', async () => {
    mocks.capabilities.mockResolvedValue({ billing: false });
    render(
      await Page({
        params: Promise.resolve({ outcome: 'complete' }),
        searchParams: Promise.resolve({ plan: 'corporate' }),
      }),
    );
    expect(screen.getByRole('heading', { name: 'Billing access restricted' })).toBeInTheDocument();
    expect(screen.queryByTestId('checkout-result')).not.toBeInTheDocument();
  });
  it('requires a designer session before exposing checkout details', async () => {
    mocks.auth.mockRejectedValue(new Error('NEXT_REDIRECT'));
    await expect(
      Page({
        params: Promise.resolve({ outcome: 'closed' }),
        searchParams: Promise.resolve({ plan: 'corporate' }),
      }),
    ).rejects.toThrow('NEXT_REDIRECT');
    expect(mocks.capabilities).not.toHaveBeenCalled();
  });
});
