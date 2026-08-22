import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import DesignerAnalyticsLoading from '../../app/(designer)/designer/analytics/loading';

describe('DesignerAnalyticsLoading', () => {
  it('mirrors the dashboard sections while analytics load', () => {
    const { container } = render(<DesignerAnalyticsLoading />);

    expect(screen.getByLabelText('Loading analytics')).toBeInTheDocument();
    expect(container.querySelectorAll('[data-slot="card"]')).toHaveLength(10);
  });
});
