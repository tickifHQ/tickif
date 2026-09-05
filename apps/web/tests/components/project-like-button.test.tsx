import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  session: null as {
    user: { id: string };
    session: { activeOrganizationId: string | null };
  } | null,
  sessionPending: false,
  push: vi.fn(),
  get: vi.fn(),
  put: vi.fn(),
  remove: vi.fn(),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('@/lib/auth-client', () => ({
  authClient: { useSession: () => ({ data: mocks.session, isPending: mocks.sessionPending }) },
}));
vi.mock('@/lib/api', () => ({
  api: {
    api: {
      'project-likes': {
        state: { $get: mocks.get },
        ':projectId': { $put: mocks.put, $delete: mocks.remove },
      },
    },
  },
}));
const { ProjectLikeButton } = await import('../../src/components/project-like-button');
const projectId = '11111111-1111-4111-8111-111111111111';
const loginHref = `/login?callbackURL=${encodeURIComponent(`/projects/${projectId}`)}`;
const state = { projectId, liked: false, likeCount: 2 };
const response = (body: unknown, status = 200) => ({
  ok: status < 300,
  status,
  json: async () => body,
});
const signIn = () => {
  mocks.session = { user: { id: 'visitor' }, session: { activeOrganizationId: null } };
};
const view = () => <ProjectLikeButton projectId={projectId} loginHref={loginHref} />;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session = null;
  mocks.sessionPending = false;
  mocks.get.mockResolvedValue(response({ projects: [state] }));
  mocks.put.mockResolvedValue(response({ ...state, liked: true, likeCount: 3 }));
  mocks.remove.mockResolvedValue(response(state));
});

describe('ProjectLikeButton', () => {
  it('shows public count and sends anonymous visitors to login with the exact return path', async () => {
    render(view());
    expect(await screen.findByText('2')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in to like project' }));
    expect(mocks.push).toHaveBeenCalledWith(loginHref);
    expect(mocks.put).not.toHaveBeenCalled();
  });
  it('loads persistent state and updates count with the server result after like and unlike', async () => {
    signIn();
    render(view());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Like project' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Like project' }));
    expect(await screen.findByRole('button', { name: 'Unlike project' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(mocks.put).toHaveBeenCalledWith({ param: { projectId } });
    fireEvent.click(screen.getByRole('button', { name: 'Unlike project' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Like project' })).toHaveAttribute(
        'aria-pressed',
        'false',
      ),
    );
    expect(screen.getByText('2')).toBeInTheDocument();
    const mounted = render(view());
    await waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(2));
    mounted.unmount();
  });
  it('loads an existing like on mount', async () => {
    signIn();
    mocks.get.mockResolvedValue(response({ projects: [{ ...state, liked: true }] }));
    render(view());
    expect(await screen.findByRole('button', { name: 'Unlike project' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
  it('waits for session and state before allowing a mutation', async () => {
    signIn();
    mocks.sessionPending = true;
    const rendered = render(view());
    expect(screen.getByRole('button')).toBeDisabled();
    expect(mocks.get).not.toHaveBeenCalled();
    mocks.sessionPending = false;
    mocks.get.mockReturnValue(new Promise(() => undefined));
    rendered.rerender(view());
    expect(screen.getByRole('button')).toBeDisabled();
  });
  it('keeps the known count on failure and allows retry', async () => {
    signIn();
    mocks.put.mockResolvedValueOnce(response({}, 500));
    render(view());
    await screen.findByText('2');
    fireEvent.click(screen.getByRole('button', { name: 'Like project' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Could not update your like');
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Like project' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Like project' }));
    expect(await screen.findByRole('button', { name: 'Unlike project' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
  it('retries a failed initial read instead of guessing the toggle state', async () => {
    signIn();
    mocks.get.mockRejectedValueOnce(new Error('Network unavailable'));
    render(view());
    fireEvent.click(await screen.findByRole('button', { name: 'Retry loading likes' }));
    expect(await screen.findByText('2')).toBeInTheDocument();
    expect(mocks.put).not.toHaveBeenCalled();
  });
  it('prevents duplicate requests while a mutation is pending', async () => {
    signIn();
    mocks.put.mockReturnValue(new Promise(() => undefined));
    render(view());
    await screen.findByText('2');
    const button = screen.getByRole('button', { name: 'Like project' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(mocks.put).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
  });
  it('explains the personal-context requirement', async () => {
    signIn();
    mocks.session!.session.activeOrganizationId = 'studio';
    render(view());
    await screen.findByText('2');
    fireEvent.click(screen.getByRole('button', { name: 'Like project' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Switch to your personal account');
    expect(mocks.put).not.toHaveBeenCalled();
  });
  it('prompts login again after the session expires', async () => {
    signIn();
    mocks.put.mockResolvedValue(response({}, 401));
    render(view());
    await screen.findByText('2');
    fireEvent.click(screen.getByRole('button', { name: 'Like project' }));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith(loginHref));
  });
  it('ignores a late response after switching accounts', async () => {
    signIn();
    let finish: ((value: ReturnType<typeof response>) => void) | undefined;
    mocks.put.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const rendered = render(view());
    await screen.findByText('2');
    fireEvent.click(screen.getByRole('button', { name: 'Like project' }));
    mocks.session!.user.id = 'another-visitor';
    rendered.rerender(view());
    await waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(2));
    await act(async () => {
      finish?.(response({ ...state, liked: true, likeCount: 3 }));
    });
    expect(screen.getByRole('button', { name: 'Like project' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByText('2')).toBeInTheDocument();
  });
  it('batches a grid in one request and deduplicates repeated project controls', async () => {
    signIn();
    const ids = Array.from(
      { length: 24 },
      (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    );
    mocks.get.mockResolvedValue(
      response({ projects: ids.map((id) => ({ ...state, projectId: id })) }),
    );
    render(
      <>
        {[...ids, ids[0]!].map((id, index) => (
          <ProjectLikeButton key={index} projectId={id} loginHref={loginHref} />
        ))}
      </>,
    );
    await waitFor(() =>
      expect(
        screen
          .getAllByRole('button', { name: 'Like project' })
          .every((button) => !button.hasAttribute('disabled')),
      ).toBe(true),
    );
    expect(mocks.get).toHaveBeenCalledTimes(1);
    expect(mocks.get).toHaveBeenCalledWith({ query: { projectIds: ids } });
  });
  it('splits larger grids at the API batch limit', async () => {
    signIn();
    const ids = Array.from(
      { length: 49 },
      (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    );
    mocks.get.mockImplementation(async ({ query }: { query: { projectIds: string[] } }) =>
      response({ projects: query.projectIds.map((id) => ({ ...state, projectId: id })) }),
    );
    render(
      <>
        {ids.map((id) => (
          <ProjectLikeButton key={id} projectId={id} loginHref={loginHref} />
        ))}
      </>,
    );
    await waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(2));
    expect(mocks.get.mock.calls.map(([request]) => request.query.projectIds.length)).toEqual([
      48, 1,
    ]);
  });
  it('updates other mounted controls for the same project after a mutation', async () => {
    signIn();
    render(
      <>
        {view()}
        {view()}
      </>,
    );
    await screen.findAllByText('2');
    fireEvent.click(screen.getAllByRole('button', { name: 'Like project' })[0]!);
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: 'Unlike project' })).toHaveLength(2),
    );
    expect(screen.getAllByText('3')).toHaveLength(2);
    expect(mocks.get).toHaveBeenCalledTimes(1);
  });
  it('ignores an older mutation response that arrives after a newer unlike', async () => {
    signIn();
    let finishOlderLike: ((value: ReturnType<typeof response>) => void) | undefined;
    let finishNewerLike: ((value: ReturnType<typeof response>) => void) | undefined;
    mocks.put
      .mockReturnValueOnce(
        new Promise((resolve) => {
          finishOlderLike = resolve;
        }),
      )
      .mockReturnValueOnce(
        new Promise((resolve) => {
          finishNewerLike = resolve;
        }),
      );
    render(
      <>
        {view()}
        {view()}
      </>,
    );
    await screen.findAllByText('2');
    const buttons = screen.getAllByRole('button', { name: 'Like project' });
    fireEvent.click(buttons[0]!);
    fireEvent.click(buttons[1]!);
    await act(async () => {
      finishNewerLike?.(response({ ...state, liked: true, likeCount: 3 }));
    });
    const unlike = await waitFor(() => {
      const button = screen
        .getAllByRole('button', { name: 'Unlike project' })
        .find((candidate) => !candidate.hasAttribute('disabled'));
      expect(button).toBeDefined();
      return button!;
    });
    fireEvent.click(unlike);
    await waitFor(() =>
      expect(
        screen
          .getAllByRole('button', { name: 'Like project' })
          .every((button) => button.getAttribute('aria-pressed') === 'false'),
      ).toBe(true),
    );
    await act(async () => {
      finishOlderLike?.(response({ ...state, liked: true, likeCount: 3 }));
    });
    expect(screen.getAllByRole('button', { name: 'Like project' })).toHaveLength(2);
    expect(screen.getAllByText('2')).toHaveLength(2);
  });
  it('reloads after logout and for a new user without reusing personalized state', async () => {
    signIn();
    mocks.get.mockResolvedValueOnce(response({ projects: [{ ...state, liked: true }] }));
    const rendered = render(view());
    await screen.findByRole('button', { name: 'Unlike project' });
    mocks.session = null;
    rendered.rerender(view());
    expect(screen.getByRole('button', { name: 'Sign in to like project' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(2));
    signIn();
    mocks.session!.user.id = 'new-visitor';
    rendered.rerender(view());
    await waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(3));
    expect(screen.getByRole('button', { name: 'Like project' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });
  it('does not let a late initial read overwrite a published mutation', async () => {
    signIn();
    const first = render(view());
    await screen.findByText('2');
    let finishRead: ((value: ReturnType<typeof response>) => void) | undefined;
    mocks.get.mockReturnValueOnce(
      new Promise((resolve) => {
        finishRead = resolve;
      }),
    );
    first.rerender(
      <>
        {view()}
        {view()}
      </>,
    );
    await waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getAllByRole('button', { name: 'Like project' })[0]!);
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: 'Unlike project' })).toHaveLength(2),
    );
    await act(async () => {
      finishRead?.(response({ projects: [state] }));
    });
    expect(screen.getAllByRole('button', { name: 'Unlike project' })).toHaveLength(2);
  });
});
