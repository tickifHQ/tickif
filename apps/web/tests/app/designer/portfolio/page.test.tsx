import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/components/designer-portfolio', () => ({
  DesignerPortfolio: () => <div data-testid="designer-portfolio" />,
}));

describe('DesignerPortfolioPage', () => {
  it('renders the portfolio settings component', async () => {
    const { default: Page } = await import(
      '../../../../app/(designer)/designer/portfolio/page'
    );

    render(<Page />);

    expect(screen.getByTestId('designer-portfolio')).toBeInTheDocument();
  });
});
