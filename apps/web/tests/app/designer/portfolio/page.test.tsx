import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/components/designer-portfolio-settings', () => ({
  DesignerPortfolioSettings: () => <div data-testid="designer-portfolio-settings" />,
}));

describe('DesignerPortfolioPage', () => {
  it('renders the portfolio settings component', async () => {
    const { default: Page } = await import(
      '../../../../app/(designer)/designer/portfolio/page'
    );

    render(<Page />);

    expect(
      screen.getByRole('heading', { name: /portfolio settings/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('designer-portfolio-settings')).toBeInTheDocument();
  });
});
