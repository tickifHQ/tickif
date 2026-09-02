import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  DesignerDashboardLoading,
  DesignerLeadsLoading,
  DesignerPlanBillingLoading,
  DesignerPortfolioLoading,
  DesignerProfileLoading,
  DesignerProjectsLoading,
  DesignerTeamRolesLoading,
} from '@/components/designer-page-loading';

const loadingPages = [
  { label: 'Loading dashboard', Component: DesignerDashboardLoading },
  { label: 'Loading projects', Component: DesignerProjectsLoading },
  { label: 'Loading leads', Component: DesignerLeadsLoading },
  { label: 'Loading profile settings', Component: DesignerProfileLoading },
  { label: 'Loading portfolio settings', Component: DesignerPortfolioLoading },
  { label: 'Loading team and roles', Component: DesignerTeamRolesLoading },
  { label: 'Loading plan and billing', Component: DesignerPlanBillingLoading },
] as const;

describe('designer page loading states', () => {
  it.each(loadingPages)('renders an accessible $label layout', ({ label, Component }) => {
    const { container } = render(<Component />);

    const loadingRegion = screen.getByRole('status', { name: label });
    expect(loadingRegion).toHaveAttribute('aria-busy', 'true');
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(5);
  });

  it('matches the loaded profile page container width', () => {
    const { container } = render(<DesignerProfileLoading />);

    const outerContainer = container.firstElementChild;
    expect(outerContainer).toHaveClass('max-w-5xl');
    expect(outerContainer).not.toHaveClass('max-w-7xl');
  });

  it('preserves the loaded portfolio column proportions', () => {
    const { container } = render(<DesignerPortfolioLoading />);
    const classNames = Array.from(container.querySelectorAll('[class]')).flatMap((element) =>
      Array.from(element.classList),
    );

    expect(classNames).toContain('lg:max-w-[65%]');
    expect(classNames).toContain('lg:w-[35%]');
  });
});
