import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  getCurrentOrgCapabilities: vi.fn(),
  getCurrentOrgIdentity: vi.fn(),
  getCurrentOrgRole: vi.fn(),
  redirect: vi.fn(),
  getCurrentDesignerProfile: vi.fn(),
}));

vi.mock('@/lib/designer-profile', () => ({
  getCurrentDesignerProfile: mock.getCurrentDesignerProfile,
}));

vi.mock('@/lib/current-org-role', () => ({
  getCurrentOrgCapabilities: mock.getCurrentOrgCapabilities,
  getCurrentOrgIdentity: mock.getCurrentOrgIdentity,
  getCurrentOrgRole: mock.getCurrentOrgRole,
}));

vi.mock('next/navigation', () => ({ redirect: mock.redirect }));

vi.mock('@/components/designer-portfolio-settings', () => ({
  DesignerPortfolioSettings: ({
    previewStats,
  }: {
    previewStats?: { yearsExperience: number | null; projectCount: number };
  }) => <div data-testid="designer-portfolio-settings">{JSON.stringify(previewStats)}</div>,
}));

vi.mock('@/components/designer-close-studio', () => ({
  DesignerCloseStudio: ({ organizationSlug }: { organizationSlug: string }) => (
    <div data-testid="close-studio">{organizationSlug}</div>
  ),
}));

describe('DesignerPortfolioPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.getCurrentDesignerProfile.mockResolvedValue({
      yearsExperience: 12,
      foundedYear: null,
      projectCount: 7,
    });
    mock.getCurrentOrgRole.mockResolvedValue('owner');
    mock.getCurrentOrgIdentity.mockResolvedValue({
      id: 'studio',
      name: 'My studio',
      slug: 'my-studio',
    });
    mock.redirect.mockImplementation(() => {
      throw new Error('redirected');
    });
  });

  it.each([null, { editOrganization: false }])(
    'denies portfolio settings without live edit capability (%j)',
    async (capabilities) => {
      mock.getCurrentOrgRole.mockResolvedValue('member');
      mock.getCurrentOrgCapabilities.mockResolvedValue(capabilities);
      const { default: Page } = await import('../../../../app/(designer)/designer/portfolio/page');

      await expect(Page()).rejects.toThrow('redirected');
      expect(mock.redirect).toHaveBeenCalledWith('/unauthorized');
      expect(mock.getCurrentOrgIdentity).not.toHaveBeenCalled();
    },
  );

  it('renders the portfolio settings component', async () => {
    mock.getCurrentOrgCapabilities.mockResolvedValue({ editOrganization: true });
    const { default: Page } = await import('../../../../app/(designer)/designer/portfolio/page');

    render(await Page());

    expect(screen.getByTestId('designer-portfolio-settings')).toBeInTheDocument();
    expect(screen.getByTestId('designer-portfolio-settings')).toHaveTextContent(
      '"yearsExperience":12,"projectCount":7',
    );
    expect(screen.getByTestId('close-studio')).toHaveTextContent('my-studio');
  });

  it('does not expose closure when the organization identity cannot be loaded', async () => {
    mock.getCurrentOrgCapabilities.mockResolvedValue({ editOrganization: true });
    mock.getCurrentOrgIdentity.mockResolvedValue(null);
    const { default: Page } = await import('../../../../app/(designer)/designer/portfolio/page');
    render(await Page());
    expect(screen.queryByTestId('close-studio')).not.toBeInTheDocument();
  });

  it('keeps portfolio editing available to admins without exposing owner closure', async () => {
    mock.getCurrentOrgCapabilities.mockResolvedValue({ editOrganization: true });
    mock.getCurrentOrgRole.mockResolvedValue('admin');
    const { default: Page } = await import('../../../../app/(designer)/designer/portfolio/page');
    render(await Page());
    expect(screen.getByTestId('designer-portfolio-settings')).toBeInTheDocument();
    expect(screen.queryByTestId('close-studio')).not.toBeInTheDocument();
  });

  it('keeps recovery available to owners when closure removes editing capabilities', async () => {
    mock.getCurrentOrgCapabilities.mockResolvedValue({ editOrganization: false });
    const { default: Page } = await import('../../../../app/(designer)/designer/portfolio/page');
    render(await Page());
    expect(screen.getByTestId('close-studio')).toBeInTheDocument();
    expect(screen.queryByTestId('designer-portfolio-settings')).not.toBeInTheDocument();
  });
});
