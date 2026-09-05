import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/components/project-like-button', () => ({ ProjectLikeButton: () => <button>Like</button> }));

const mocks = vi.hoisted(() => ({
  session: null as { user: { id: string } } | null,
  getSavedState: vi.fn(),
  saveProject: vi.fn(),
  unsaveProject: vi.fn(),
}));

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    useSession: () => ({ data: mocks.session, isPending: false }),
  },
}));

vi.mock('@/lib/api', () => ({
  api: {
    api: {
      'saved-projects': {
        state: { $get: mocks.getSavedState },
        ':projectId': {
          $put: mocks.saveProject,
          $delete: mocks.unsaveProject,
        },
      },
    },
  },
}));

const { ProjectActions } = await import('../../src/components/project-actions');

function response(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    json: async () => body,
  };
}

describe('ProjectActions', () => {
  beforeEach(() => {
    mocks.session = null;
    vi.clearAllMocks();
    mocks.getSavedState.mockResolvedValue(response({ savedProjectIds: [] }));
    mocks.saveProject.mockResolvedValue(
      response({ projectId: '11111111-1111-4111-8111-111111111111', saved: true }),
    );
    mocks.unsaveProject.mockResolvedValue(
      response({ projectId: '11111111-1111-4111-8111-111111111111', saved: false }),
    );
  });

  it('routes signed-out visitors to login before saving', () => {
    render(
      <ProjectActions
        projectId="11111111-1111-4111-8111-111111111111"
        loginHref="/login?callbackURL=%2Fprojects%2F11111111-1111-4111-8111-111111111111"
        canonicalUrl="https://tickif.com/projects/11111111-1111-4111-8111-111111111111"
      />,
    );

    expect(screen.getByRole('link', { name: 'Sign in to save project' })).toHaveAttribute(
      'href',
      '/login?callbackURL=%2Fprojects%2F11111111-1111-4111-8111-111111111111',
    );
    expect(mocks.getSavedState).not.toHaveBeenCalled();
  });

  it('loads and updates save state through the existing API', async () => {
    const projectId = '11111111-1111-4111-8111-111111111111';
    mocks.session = { user: { id: '22222222-2222-4222-8222-222222222222' } };
    render(
      <ProjectActions
        projectId={projectId}
        loginHref="/login"
        canonicalUrl={`https://tickif.com/projects/${projectId}`}
      />,
    );

    await waitFor(() =>
      expect(mocks.getSavedState).toHaveBeenCalledWith({ query: { projectIds: projectId } }),
    );
    expect(screen.getByText('Save')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save project' }));

    await waitFor(() => expect(mocks.saveProject).toHaveBeenCalledWith({ param: { projectId } }));
    expect(await screen.findByRole('button', { name: 'Remove saved project' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByText('Saved')).toBeInTheDocument();
  });

  it('does not allow saving before the existing saved state has loaded', async () => {
    let resolveSavedState: ((value: ReturnType<typeof response>) => void) | undefined;
    mocks.getSavedState.mockReturnValue(
      new Promise<ReturnType<typeof response>>((resolve) => {
        resolveSavedState = resolve;
      }),
    );
    mocks.session = { user: { id: '22222222-2222-4222-8222-222222222222' } };

    render(
      <ProjectActions
        projectId="11111111-1111-4111-8111-111111111111"
        loginHref="/login"
        canonicalUrl="https://tickif.com/projects/11111111-1111-4111-8111-111111111111"
      />,
    );

    expect(screen.getByRole('button', { name: 'Loading saved project state' })).toBeDisabled();
    expect(mocks.saveProject).not.toHaveBeenCalled();

    resolveSavedState?.(response({ savedProjectIds: [] }));
    expect(await screen.findByRole('button', { name: 'Save project' })).toBeEnabled();
  });

  it('copies the canonical project URL without browser query parameters or fragments', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    window.history.replaceState(
      {},
      '',
      '/projects/11111111-1111-4111-8111-111111111111?utm_source=test#project-room-example',
    );
    render(
      <ProjectActions
        projectId="11111111-1111-4111-8111-111111111111"
        loginHref="/login"
        canonicalUrl="https://tickif.com/projects/11111111-1111-4111-8111-111111111111"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Share project' }));

    expect(await screen.findByRole('button', { name: 'Project link copied' })).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith(
      'https://tickif.com/projects/11111111-1111-4111-8111-111111111111',
    );
  });

  it('passes the canonical project URL to native sharing', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { configurable: true, value: share });
    render(
      <ProjectActions
        projectId="11111111-1111-4111-8111-111111111111"
        loginHref="/login"
        canonicalUrl="https://tickif.com/projects/11111111-1111-4111-8111-111111111111"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Share project' }));

    await waitFor(() =>
      expect(share).toHaveBeenCalledWith({
        title: document.title,
        url: 'https://tickif.com/projects/11111111-1111-4111-8111-111111111111',
      }),
    );
  });
});
