import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { AdminPlatformSummary } from '../../src/components/admin-platform-summary';

describe('AdminPlatformSummary', () => {
  it('maps and labels every supported total without implying time-based analytics', () => {
    render(
      <AdminPlatformSummary
        summary={{
          users: 1234567,
          activeUsers: 765,
          enquiries: 321,
          openEnquiries: 12,
          projectViews: 9001,
          profileViews: 4400,
          searches: 888,
        }}
      />,
    );

    const region = screen.getByRole('region', { name: 'Platform summary' });
    expect(within(region).getByText('12,34,567')).toBeInTheDocument();
    expect(within(region).getByText('Accounts currently marked with active status.')).toBeVisible();
    expect(within(region).getByText('Retained authenticated, non-empty searches.')).toBeVisible();
    expect(within(region).getByText(/not time-based trends/i)).toBeVisible();
    expect(within(region).queryByText(/daily|monthly|growth/i)).not.toBeInTheDocument();

    expect(within(region).queryByRole('link')).not.toBeInTheDocument();
    expect(region.querySelector('.lucide-arrow-up-right')).not.toBeInTheDocument();
  });

  it('shows valid zero totals without empty-state placeholders', () => {
    render(
      <AdminPlatformSummary
        summary={{
          users: 0,
          activeUsers: 0,
          enquiries: 0,
          openEnquiries: 0,
          projectViews: 0,
          profileViews: 0,
          searches: 0,
        }}
      />,
    );

    expect(screen.getAllByText('0')).toHaveLength(7);
    expect(screen.queryByText(/no data/i)).not.toBeInTheDocument();
  });
});
