import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type * as AuthGuard from '@/lib/auth-guard';

const mock = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  redirect: vi.fn((_: string) => {
    throw new Error('NEXT_REDIRECT');
  }),
}));

vi.mock('next/navigation', () => ({ redirect: mock.redirect }));
vi.mock('@/lib/auth-guard', async (importOriginal) => ({
  ...(await importOriginal<typeof AuthGuard>()),
  requireAuth: mock.requireAuth,
}));

describe('Deferred designer onboarding', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(['visitor', null])(
    'offers %s accounts clear paths to resume setup or discover projects',
    async (role) => {
      mock.requireAuth.mockResolvedValue({ user: { role }, session: {} });
      const { default: Page } =
        await import('../../../../../app/(protected)/designer/onboarding/deferred/page');
      render(await Page());

      expect(mock.requireAuth).toHaveBeenCalledWith();
      expect(
        screen.getByRole('heading', { name: 'Finish setting up your designer workspace' }),
      ).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Continue setup' })).toHaveAttribute(
        'href',
        '/designer/onboarding',
      );
      expect(screen.getByRole('link', { name: 'Explore projects' })).toHaveAttribute(
        'href',
        '/home',
      );
      expect(mock.redirect).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['designer', 'org-1', '/designer/dashboard'],
    ['designer', null, '/designer/select-studio'],
    ['admin', null, '/dashboard'],
    ['superadmin', 'org-1', '/dashboard'],
    ['unknown', null, '/unauthorized'],
  ])(
    'routes an existing %s account to its supported destination',
    async (role, activeOrganizationId, path) => {
      mock.requireAuth.mockResolvedValue({ user: { role }, session: { activeOrganizationId } });
      const { default: Page } =
        await import('../../../../../app/(protected)/designer/onboarding/deferred/page');

      await expect(Page()).rejects.toThrow('NEXT_REDIRECT');
      expect(mock.redirect).toHaveBeenCalledWith(path);
    },
  );
});
