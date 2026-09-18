import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  getCurrentOrgCapabilities: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock('@/lib/current-org-role', () => ({
  getCurrentOrgCapabilities: mock.getCurrentOrgCapabilities,
}));

vi.mock('next/navigation', () => ({ redirect: mock.redirect }));

vi.mock('@/components/designer-portfolio-settings', () => ({
  DesignerPortfolioSettings: () => <div data-testid="designer-portfolio-settings" />,
}));

describe('DesignerPortfolioPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.redirect.mockImplementation(() => {
      throw new Error('redirected');
    });
  });

  it.each([null, { editOrganization: false }])(
    'denies portfolio settings without live edit capability (%j)',
    async (capabilities) => {
      mock.getCurrentOrgCapabilities.mockResolvedValue(capabilities);
      const { default: Page } = await import('../../../../app/(designer)/designer/portfolio/page');

      await expect(Page()).rejects.toThrow('redirected');
      expect(mock.redirect).toHaveBeenCalledWith('/unauthorized');
    },
  );

  it('renders the portfolio settings component', async () => {
    mock.getCurrentOrgCapabilities.mockResolvedValue({ editOrganization: true });
    const { default: Page } = await import('../../../../app/(designer)/designer/portfolio/page');

    render(await Page());

    expect(screen.getByTestId('designer-portfolio-settings')).toBeInTheDocument();
  });
});
