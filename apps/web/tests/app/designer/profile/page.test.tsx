import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  getProfileEditorPageData: vi.fn(),
}));

vi.mock('@/lib/profile-editor-data', () => ({
  getProfileEditorPageData: mock.getProfileEditorPageData,
}));

vi.mock('@/components/designer-profile-editor', () => ({
  DesignerProfileEditor: ({ initialProfile }: { initialProfile: { displayName: string } }) => (
    <div data-testid="designer-profile-editor">{initialProfile.displayName}</div>
  ),
}));

describe('DesignerProfilePage', () => {
  it('loads the live editor data on the server and renders the editor', async () => {
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
