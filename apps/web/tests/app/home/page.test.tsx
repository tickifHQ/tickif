import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const mock = vi.hoisted(() => ({
  getServerSession: vi.fn(),
}));

vi.mock('@/lib/auth-guard', () => ({
  getServerSession: mock.getServerSession,
}));

import HomePage from '../../../app/(public)/page';

describe('HomePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the logged-out state: trust strip, hero, and trending projects feed', async () => {
    mock.getServerSession.mockResolvedValue(null);

    render(await HomePage());

    expect(screen.getByText('No commissions · No middlemen')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Trending projects' })).toBeInTheDocument();
    expect(screen.getByText('See all projects →')).toBeInTheDocument();
    // Logged-in-only search scope buttons must not render
    expect(screen.queryByRole('button', { name: 'Projects' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Designers' })).not.toBeInTheDocument();
    // Feed extras from the design render in both states
    expect(screen.getByText('💡 Try a filter')).toBeInTheDocument();
    expect(screen.getByText('Sponsored')).toBeInTheDocument();
  });

  it('renders the logged-in state: search bar straight into the feed, no hero or trust strip', async () => {
    mock.getServerSession.mockResolvedValue({
      session: { id: 's1', token: 't1', expiresAt: '2026-12-31T00:00:00.000Z' },
      user: { id: 'u1', name: 'Mahi', email: 'mahi@test.com', role: 'visitor' },
    });

    render(await HomePage());

    expect(screen.getByRole('search')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Projects' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Designers' })).toBeInTheDocument();
    // Logged-out chrome must not render
    expect(screen.queryByText('No commissions · No middlemen')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Trending projects' })).not.toBeInTheDocument();
    // Shared feed still renders
    expect(screen.getByText('💡 Try a filter')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Filters' }).length).toBeGreaterThan(0);
  });
});
