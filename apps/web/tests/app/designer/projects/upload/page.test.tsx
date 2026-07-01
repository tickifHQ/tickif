import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  requireAuth: vi.fn(),
}));

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
  });

  it('passes projectId search param into the upload builder for draft resume', async () => {
    const { default: Page } = await import('../../../../../app/(designer)/designer/projects/upload/page');

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
    const { default: Page } = await import('../../../../../app/(designer)/designer/projects/upload/page');

    const page = await Page({ searchParams: Promise.resolve({}) });
    render(page);

    expect(screen.getByTestId('designer-project-upload')).toHaveTextContent('new-draft');
  });
});
