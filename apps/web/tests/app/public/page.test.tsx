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
  activeContextForSession: (session: {
    session: { activeOrganizationId?: string | null; activeTeamId?: string | null };
  }) =>
    session.session.activeOrganizationId && session.session.activeTeamId
      ? { kind: 'organization' }
      : { kind: 'personal' },
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

  it('sends designers to their personal home instead of the visitor page', async () => {
    mock.getServerSession.mockResolvedValue({
      user: { id: 'u1', name: 'Asha', email: 'a@x.com', role: 'designer' },
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

  it('lets an organization-context designer browse the public discovery page', async () => {
    mock.getServerSession.mockResolvedValue({
      user: { id: 'u1', name: 'Asha', email: 'a@x.com', role: 'designer' },
      session: {
        id: 's1',
        token: 't',
        expiresAt: new Date().toISOString(),
        activeOrganizationId: 'org-1',
        activeTeamId: 'team-1',
      },
    });

    render(await PublicHomePage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByRole('heading', { name: 'Explore home projects' })).toBeInTheDocument();
  });

  it('still renders the visitor homepage for signed-out users', async () => {
    render(await PublicHomePage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByRole('heading', { name: /Inspire from homes/i })).toBeInTheDocument();
  });
});
