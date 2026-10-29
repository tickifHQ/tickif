import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServerSession = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth-guard', () => ({ getServerSession }));
vi.mock('@/components/public-shell', () => ({
  PublicShell: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('@/components/landing-project-preview', () => ({
  LandingProjectPreviewProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('@/components/scroll-gate', () => ({ ScrollGate: () => null }));
vi.mock('@/components/google-one-tap', () => ({
  GoogleOneTap: () => <div data-testid="google-one-tap" />,
}));

describe('PublicLayout', () => {
  beforeEach(() => {
    getServerSession.mockReset();
  });

  it('offers Google One Tap to signed-out visitors', async () => {
    getServerSession.mockResolvedValue(null);
    const { default: PublicLayout } = await import('../../../app/(public)/layout');

    render(await PublicLayout({ children: <main /> }));

    expect(screen.getByTestId('google-one-tap')).toBeInTheDocument();
  });

  it('never offers Google One Tap to a signed-in user', async () => {
    getServerSession.mockResolvedValue({ user: { role: 'visitor' } });
    const { default: PublicLayout } = await import('../../../app/(public)/layout');

    render(await PublicLayout({ children: <main /> }));

    expect(screen.queryByTestId('google-one-tap')).not.toBeInTheDocument();
  });
});
