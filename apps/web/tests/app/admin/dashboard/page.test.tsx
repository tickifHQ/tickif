import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import AdminDashboardPage from '../../../../app/(admin)/dashboard/page';

describe('AdminDashboardPage', () => {
  it('keeps the dashboard empty and links to moderation', () => {
    render(<AdminDashboardPage />);

    expect(screen.getByRole('heading', { name: /admin dashboard/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /open moderation/i })).toHaveAttribute(
      'href',
      '/moderation',
    );
  });
});
