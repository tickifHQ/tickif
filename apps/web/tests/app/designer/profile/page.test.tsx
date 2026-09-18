import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  getProfileEditorPageData: vi.fn(),
  getCurrentOrgCapabilities: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock('@/lib/current-org-role', () => ({
  getCurrentOrgCapabilities: mock.getCurrentOrgCapabilities,
}));

vi.mock('next/navigation', () => ({ redirect: mock.redirect }));

vi.mock('@/lib/profile-editor-data', () => ({
  getProfileEditorPageData: mock.getProfileEditorPageData,
}));

vi.mock('@/components/designer-profile-editor', () => ({
  DesignerProfileEditor: ({ initialProfile }: { initialProfile: { displayName: string } }) => (
    <div data-testid="designer-profile-editor">{initialProfile.displayName}</div>
  ),
}));

describe('DesignerProfilePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.redirect.mockImplementation(() => {
      throw new Error('redirected');
    });
  });

  it.each([null, { editOrganization: false }])(
    'denies the organization profile editor without live edit capability (%j)',
    async (capabilities) => {
      mock.getCurrentOrgCapabilities.mockResolvedValue(capabilities);
      const { default: Page } = await import('../../../../app/(designer)/designer/profile/page');

      await expect(Page()).rejects.toThrow('redirected');
      expect(mock.redirect).toHaveBeenCalledWith('/unauthorized');
      expect(mock.getProfileEditorPageData).not.toHaveBeenCalled();
    },
  );

  it('loads the live editor data on the server and renders the editor', async () => {
    mock.getCurrentOrgCapabilities.mockResolvedValue({ editOrganization: true });
    mock.getProfileEditorPageData.mockResolvedValue({
      profile: { displayName: 'Mahi Studio' },
      completion: null,
      taxonomy: { cities: [], scopes: [], themes: [] },
      taxonomyError: null,
    });
    const { default: Page } = await import('../../../../app/(designer)/designer/profile/page');

    render(await Page());

    expect(mock.getProfileEditorPageData).toHaveBeenCalledOnce();
    expect(screen.getByTestId('designer-profile-editor')).toHaveTextContent('Mahi Studio');
  });
});
