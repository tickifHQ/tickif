import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DesignerDashboardSectionPage } from '../../src/components/designer-dashboard-section-page';

describe('DesignerDashboardSectionPage', () => {
  it.each([
    ['consultations', 'Manage homeowner consultations', 'View leads'],
    ['reviews', 'Collect and manage client reviews', 'Update profile'],
    ['analytics', 'Understand portfolio performance', 'View projects'],
    ['terms-roles', 'Control studio access and operating terms', 'Update profile'],
    ['plan-billing', 'Track plan access and billing readiness', 'Contact support'],
  ] as const)('renders the %s section page', (section, title, action) => {
    const { container } = render(<DesignerDashboardSectionPage section={section} />);

    expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: new RegExp(action, 'i') })).toBeInTheDocument();
    expect(screen.getByText(/workspace snapshot/i)).toBeInTheDocument();
    expect(screen.getByText(/current setup/i)).toBeInTheDocument();
    expect(container.querySelectorAll('.h-full.flex-1.items-end')).toHaveLength(7);
  });
});
