import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import AdminDashboardLoading from '../../../../app/(admin)/dashboard/loading';

describe('AdminDashboardLoading', () => {
  it('announces a responsive summary loading state without placeholder metrics', () => {
    const { container } = render(<AdminDashboardLoading />);

    expect(screen.getByRole('region', { name: 'Loading platform summary' })).toBeInTheDocument();
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(33);
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });
});
