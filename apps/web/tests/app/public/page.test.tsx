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

  it('sends designers to their personal home instead of the visitor page', async () => {
    mock.getServerSession.mockResolvedValue({
      user: { id: 'u1', name: 'Asha', email: 'a@x.com', role: 'designer' },
      session: { id: 's1', token: 't', expiresAt: new Date().toISOString() },
    });

    await expect(PublicHomePage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      'NEXT_REDIRECT:/home',
    );
  });

  it('still renders the visitor homepage for signed-out users', async () => {
    render(await PublicHomePage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByRole('heading', { name: /Inspire from homes/i })).toBeInTheDocument();
  });
});
