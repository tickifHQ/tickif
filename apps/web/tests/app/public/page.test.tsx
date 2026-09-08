import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const mock = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
}));

vi.mock('next/navigation', () => ({
  redirect: mock.redirect,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
}));

vi.mock('@/lib/auth-guard', () => ({
  getServerSession: mock.getServerSession,
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.stubGlobal(
  'fetch',
  vi.fn(async () => ({
    ok: true,
    json: async () => ({ terms: [] }),
  })),
);

import PublicHomePage from '../../../app/(public)/page';

describe('PublicHomePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.getServerSession.mockResolvedValue(null);
  });

  it('sends signed-in visitors to their personal home', async () => {
    mock.getServerSession.mockResolvedValue({
      user: { id: 'u1', name: 'Asha', email: 'a@x.com', role: 'visitor' },
      session: {
        id: 's1',
        token: 't',
        expiresAt: new Date().toISOString(),
        activeOrganizationId: null,
        activeTeamId: null,
      },
    });

    await expect(PublicHomePage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      'NEXT_REDIRECT:/home',
    );
  });

  it.each([null, 'org-1'])('sends designers to their dashboard', async (organizationId) => {
    mock.getServerSession.mockResolvedValue({
      user: { id: 'u1', name: 'Asha', email: 'a@x.com', role: 'designer' },
      session: {
        id: 's1',
        token: 't',
        expiresAt: new Date().toISOString(),
        activeOrganizationId: organizationId,
        activeTeamId: organizationId ? 'team-1' : null,
      },
    });

    await expect(PublicHomePage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      'NEXT_REDIRECT:/designer/dashboard',
    );
  });

  it.each(['admin', 'superadmin'])(
    'sends signed-in %s users to the admin dashboard',
    async (role) => {
      mock.getServerSession.mockResolvedValue({
        user: { id: 'u1', name: 'Asha', email: 'a@x.com', role },
        session: {
          id: 's1',
          token: 't',
          expiresAt: new Date().toISOString(),
          activeOrganizationId: null,
          activeTeamId: null,
        },
      });

      await expect(PublicHomePage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
        'NEXT_REDIRECT:/dashboard',
      );
    },
  );

  it('fails closed for an authenticated user with an invalid role', async () => {
    mock.getServerSession.mockResolvedValue({
      user: { id: 'u1', name: 'Asha', email: 'a@x.com', role: 'unknown' },
      session: {
        id: 's1',
        token: 't',
        expiresAt: new Date().toISOString(),
        activeOrganizationId: null,
        activeTeamId: null,
      },
    });

    await expect(PublicHomePage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      'NEXT_REDIRECT:/unauthorized',
    );
  });

  it('still renders the visitor homepage for signed-out users', async () => {
    render(await PublicHomePage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByRole('heading', { name: /Inspire from homes/i })).toBeInTheDocument();
  });
});
