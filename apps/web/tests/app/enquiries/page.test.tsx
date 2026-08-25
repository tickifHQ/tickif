import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
}));

vi.mock('@/lib/auth-guard', () => ({
  getServerSession: mock.getServerSession,
}));

vi.mock('next/navigation', () => ({
  redirect: mock.redirect,
}));

vi.mock('@/components/enquiries-page-client', () => ({
  EnquiriesPageClient: () => <div data-testid="enquiries-page" />,
}));

describe('EnquiriesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.getServerSession.mockResolvedValue(null);
  });

  it('returns signed-out users to enquiries after login', async () => {
    const { default: Page } = await import('../../../app/(public)/enquiries/page');

    await expect(Page()).rejects.toThrow('NEXT_REDIRECT:/login?callbackURL=%2Fenquiries');
  });

  it('renders enquiries for an authenticated user', async () => {
    mock.getServerSession.mockResolvedValue({
      user: { id: 'user-1', role: 'visitor' },
      session: { id: 'session-1' },
    });
    const { default: Page } = await import('../../../app/(public)/enquiries/page');

    render(await Page());

    expect(screen.getByTestId('enquiries-page')).toBeInTheDocument();
  });
});
