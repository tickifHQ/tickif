import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AnalyticsDateRangeControl } from '../../src/components/analytics-date-range-control';

const mock = vi.hoisted(() => ({
  params: new URLSearchParams(),
  push: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/designer/analytics',
  useRouter: () => ({ push: mock.push }),
  useSearchParams: () => mock.params,
}));

describe('AnalyticsDateRangeControl', () => {
  beforeEach(() => {
    mock.params = new URLSearchParams();
    vi.clearAllMocks();
  });

  it('shows the selected rolling window and its derived date range', () => {
    render(
      <AnalyticsDateRangeControl
        days={30}
        from="2026-07-15T00:00:00.000Z"
        to="2026-08-13T15:00:00.000Z"
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Analytics period: last 30 days' }),
    ).toHaveTextContent('Last 30 days');
    expect(screen.getByLabelText('Selected analytics date range')).toHaveTextContent(
      '15 Jul - 13 Aug, 2026',
    );
  });

  it('updates the shareable query when another window is selected', async () => {
    render(
      <AnalyticsDateRangeControl
        days={30}
        from="2026-07-15T00:00:00.000Z"
        to="2026-08-13T15:00:00.000Z"
      />,
    );

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Analytics period: last 30 days' }), {
      button: 0,
    });
    fireEvent.click(await screen.findByRole('menuitemradio', { name: 'Last 7 days' }));

    expect(mock.push).toHaveBeenCalledWith('/designer/analytics?days=7');
  });

  it('removes the query parameter when returning to the default window', async () => {
    mock.params = new URLSearchParams('days=7');
    render(
      <AnalyticsDateRangeControl
        days={7}
        from="2026-08-07T00:00:00.000Z"
        to="2026-08-13T15:00:00.000Z"
      />,
    );

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Analytics period: last 7 days' }), {
      button: 0,
    });
    fireEvent.click(await screen.findByRole('menuitemradio', { name: 'Last 30 days' }));

    expect(mock.push).toHaveBeenCalledWith('/designer/analytics');
  });
});
