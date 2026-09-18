import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  getCurrentOrgCapabilities: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock('@/lib/current-org-role', () => ({
  getCurrentOrgCapabilities: mock.getCurrentOrgCapabilities,
}));
vi.mock('next/navigation', () => ({ redirect: mock.redirect }));

vi.mock('@/lib/auth-guard', () => ({
  requireAuth: mock.requireAuth,
}));

vi.mock('@/components/designer-project-upload', () => ({
  DesignerProjectUpload: ({ initialProjectId }: { initialProjectId?: string }) => (
    <div data-testid="designer-project-upload">{initialProjectId ?? 'new-draft'}</div>
  ),
}));

describe('DesignerProjectUploadPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.getCurrentOrgCapabilities.mockResolvedValue({ writeProjects: true });
    mock.redirect.mockImplementation(() => {
      throw new Error('redirected');
    });
  });

  it.each([null, { writeProjects: false }])(
    'denies the editor without live write capability (%j)',
    async (capabilities) => {
      mock.getCurrentOrgCapabilities.mockResolvedValue(capabilities);
      const { default: Page } =
        await import('../../../../../app/(designer)/designer/projects/upload/page');
      await expect(Page({ searchParams: Promise.resolve({}) })).rejects.toThrow('redirected');
      expect(mock.redirect).toHaveBeenCalledWith('/unauthorized');
    },
  );

  it('passes projectId search param into the upload builder for draft resume', async () => {
    const { default: Page } =
      await import('../../../../../app/(designer)/designer/projects/upload/page');

    const page = await Page({
      searchParams: Promise.resolve({ projectId: '11111111-1111-4111-8111-111111111111' }),
    });
    render(page);

    expect(mock.requireAuth).toHaveBeenCalledWith({ requiredRole: 'designer' });
    expect(screen.getByTestId('designer-project-upload')).toHaveTextContent(
      '11111111-1111-4111-8111-111111111111',
    );
  });

  it('starts a new draft when no projectId is present', async () => {
    const { default: Page } =
      await import('../../../../../app/(designer)/designer/projects/upload/page');

    const page = await Page({ searchParams: Promise.resolve({}) });
    render(page);

    expect(screen.getByTestId('designer-project-upload')).toHaveTextContent('new-draft');
  });
});
