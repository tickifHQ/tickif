import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type * as AuthGuard from '@/lib/auth-guard';

const mock = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  redirect: vi.fn(() => {
    throw new Error('NEXT_REDIRECT');
  }),
}));

vi.mock('next/navigation', () => ({ redirect: mock.redirect }));
vi.mock('@/lib/auth-guard', async (importOriginal) => ({
  ...(await importOriginal<typeof AuthGuard>()),
  getServerSession: mock.getServerSession,
}));
vi.mock('@/components/new-organization-form', () => ({
  NewOrganizationForm: () => <div data-testid="new-organization-form" />,
}));

describe('NewOrganizationPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(['visitor', null, 'unknown'])(
    'denies organization creation to %s accounts without prompting for onboarding',
    async (role) => {
      mock.getServerSession.mockResolvedValue({ user: { role }, session: {} });
      const { default: Page } =
        await import('../../../../app/(protected)/designer/new-organization/page');

      await expect(Page()).rejects.toThrow('NEXT_REDIRECT');
      expect(mock.redirect).toHaveBeenCalledExactlyOnceWith('/unauthorized');
    },
  );

  it('allows designers to create an organization', async () => {
    mock.getServerSession.mockResolvedValue({ user: { role: 'designer' }, session: {} });
    const { default: Page } =
      await import('../../../../app/(protected)/designer/new-organization/page');

    render(await Page());
    expect(screen.getByTestId('new-organization-form')).toBeInTheDocument();
    expect(mock.redirect).not.toHaveBeenCalled();
  });
});
