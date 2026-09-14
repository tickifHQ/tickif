import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminDashboardCharts } from '../../src/components/admin-dashboard-charts';

class ChartResizeObserver implements ResizeObserver {
  constructor(private readonly callback: ResizeObserverCallback) {}

  observe() {
    this.callback([{ contentRect: { width: 560, height: 256 } } as ResizeObserverEntry], this);
  }

  unobserve() {}

  disconnect() {}
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ChartResizeObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AdminDashboardCharts', () => {
  it('summarizes live work by workflow and distinguishes follow-up work', () => {
    render(
      <AdminDashboardCharts
        data={{
          projectModeration: 3,
          verificationNew: 4,
          verificationReReview: 2,
          reviewsPending: 5,
          reviewsDisputed: 1,
        }}
      />,
    );

    expect(screen.getByRole('region', { name: 'Queue workload' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Follow-up pressure' })).toBeInTheDocument();
    expect(screen.getByText('15 active items')).toBeInTheDocument();
    expect(screen.getByText('20%')).toBeInTheDocument();
    expect(screen.getByText('3 need follow-up')).toBeInTheDocument();
    expect(
      screen.getByRole('img', {
        name: 'Queue workload: 3 project moderation, 6 profile verification, and 6 review moderation items',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('img', {
        name: 'Follow-up pressure: 3 of 15 active items need follow-up',
      }),
    ).toBeInTheDocument();
  });

  it('renders a stable empty state when every live queue is empty', () => {
    render(
      <AdminDashboardCharts
        data={{
          projectModeration: 0,
          verificationNew: 0,
          verificationReReview: 0,
          reviewsPending: 0,
          reviewsDisputed: 0,
        }}
      />,
    );

    expect(screen.getByText('All review queues are clear.')).toBeInTheDocument();
    expect(screen.getByText('No follow-up work is waiting.')).toBeInTheDocument();
  });
});
