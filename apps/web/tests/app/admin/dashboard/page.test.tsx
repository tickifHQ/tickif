import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import AdminDashboardPage from '../../../../app/(admin)/dashboard/page';

describe('AdminDashboardPage', () => {
  it('links to both admin review queues', () => {
    render(<AdminDashboardPage />);

    expect(screen.getByRole('heading', { name: /admin dashboard/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /open moderation/i })).toHaveAttribute(
      'href',
      '/moderation',
    );
    expect(screen.getByRole('link', { name: /profile verification/i })).toHaveAttribute(
      'href',
      '/verifications',
    );
  });
});
