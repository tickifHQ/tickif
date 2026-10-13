import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({
  session: null as { user: { id: string } } | null,
  state: vi.fn(),
  follow: vi.fn(),
  remove: vi.fn(),
}));
vi.mock('@/lib/auth-client', () => ({
  authClient: { useSession: () => ({ data: mock.session, isPending: false }) },
}));
vi.mock('@/lib/visitor-activity.actions', () => ({
  refreshVisitorHomeActivity: vi.fn(async () => {}),
}));
vi.mock('@/lib/api', () => ({
  api: {
    api: {
      following: {
        ':designerProfileId': { $get: mock.state, $put: mock.follow, $delete: mock.remove },
      },
    },
  },
}));
vi.mock('@/components/action-login-dialog', () => ({
  ActionLoginDialog: ({ open }: { open: boolean }) =>
    open ? <div role="dialog">Sign in</div> : null,
}));
import { FollowDesignerButton, FollowDesignerProvider } from '@/components/follow-designer-button';
const id = '11111111-1111-4111-8111-111111111111';
const response = (following: boolean, status = 200) =>
  new Response(JSON.stringify({ designerProfileId: id, following }), { status });
const props = { designerProfileId: id, designerName: 'Studio', loginHref: '/login' };
function PortfolioActions() {
  return (
    <FollowDesignerProvider designerProfileId={id}>
      <FollowDesignerButton {...props} size="lg" />
      <FollowDesignerButton {...props} size="lg" />
    </FollowDesignerProvider>
  );
}
describe('follow control', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.session = { user: { id: 'visitor' } };
    mock.state.mockImplementation(async () => response(false));
    mock.follow.mockImplementation(async () => response(true));
    mock.remove.mockImplementation(async () => response(false));
  });
  it('loads state and toggles through real typed endpoints with Lucide icons', async () => {
    render(<FollowDesignerButton {...props} />);
    const button = screen.getByRole('button', { name: 'Follow Studio' });
    await waitFor(() => expect(button).toBeEnabled());
    expect(button.querySelector('svg.lucide-user-plus')).toBeInTheDocument();
    fireEvent.click(button);
    const following = await screen.findByRole('button', { name: 'Unfollow Studio' });
    expect(following).toHaveAttribute('aria-pressed', 'true');
    expect(following.querySelector('svg.lucide-user-check')).toBeInTheDocument();
    expect(following).toHaveClass(
      'h-8',
      'px-3',
      'rounded-full',
      'aria-pressed:bg-primary',
      'aria-pressed:text-primary-foreground',
      'aria-pressed:shadow-none',
      '[@media(hover:none)]:h-11',
    );
    expect(following).not.toHaveClass('bg-primary-soft');
    await waitFor(() => expect(following).toBeEnabled());
    fireEvent.click(following);
    await screen.findByRole('button', { name: 'Follow Studio' });
    expect(button).toHaveClass('border-border-strong');
    expect(button).not.toHaveClass('project-save-control');
    expect(mock.remove).toHaveBeenCalledWith({ param: { designerProfileId: id } });
  });
  it('opens sign-in without an anonymous mutation', async () => {
    mock.session = null;
    render(<FollowDesignerButton {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Follow Studio' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(mock.follow).not.toHaveBeenCalled();
  });
  it('keeps unknown state disabled and exposes a working read retry', async () => {
    mock.state.mockRejectedValueOnce(new Error('Offline'));
    render(<FollowDesignerButton {...props} />);
    await screen.findByRole('status');
    expect(screen.getByRole('button', { name: 'Follow Studio' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Follow Studio' })).toBeEnabled(),
    );
  });
  it('retains confirmed state after a failed mutation', async () => {
    mock.follow.mockResolvedValueOnce(response(false, 503));
    render(<FollowDesignerButton {...props} />);
    const button = screen.getByRole('button', { name: 'Follow Studio' });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    expect(await screen.findByRole('status')).toHaveTextContent('Please try again');
    expect(button).toHaveAttribute('aria-pressed', 'false');
  });
  it('keeps the saved-pill styling when unfollow fails', async () => {
    mock.state.mockResolvedValue(response(true));
    mock.remove.mockResolvedValueOnce(response(true, 503));
    render(<FollowDesignerButton {...props} />);
    const button = await screen.findByRole('button', { name: 'Unfollow Studio' });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    expect(await screen.findByRole('status')).toHaveTextContent('Please try again');
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(button).toHaveClass(
      'h-8',
      'aria-pressed:bg-primary',
      'aria-pressed:text-primary-foreground',
    );
    await waitFor(() => expect(button).toBeEnabled());
  });
  it('omits an owned or unavailable studio control', async () => {
    mock.state.mockResolvedValue(response(false, 403));
    render(<FollowDesignerButton {...props} />);
    await waitFor(() => expect(screen.queryByRole('button')).toBeNull());
  });
  it('shares one read, synchronizes both controls and prevents duplicate pending writes', async () => {
    let finish!: (response: Response) => void;
    mock.follow.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    render(<PortfolioActions />);
    const buttons = screen.getAllByRole('button', { name: 'Follow Studio' });
    await waitFor(() => buttons.forEach((button) => expect(button).toBeEnabled()));
    expect(mock.state).toHaveBeenCalledOnce();
    buttons.forEach((button) => expect(button).toHaveClass('h-12.5'));
    fireEvent.click(buttons[0]!);
    buttons.forEach((button) => expect(button).toBeDisabled());
    fireEvent.click(buttons[1]!);
    expect(mock.follow).toHaveBeenCalledOnce();
    await act(async () => finish(response(true)));
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: 'Unfollow Studio' })).toHaveLength(2),
    );
    fireEvent.click(screen.getAllByRole('button', { name: 'Unfollow Studio' })[1]!);
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: 'Follow Studio' })).toHaveLength(2),
    );
    expect(mock.remove).toHaveBeenCalledOnce();
  });
  it('shares read retry and retains both confirmed states after a failed unfollow', async () => {
    mock.state.mockRejectedValueOnce(new Error('Offline')).mockResolvedValue(response(true));
    mock.remove.mockResolvedValueOnce(response(true, 503));
    render(<PortfolioActions />);
    const retry = await screen.findAllByRole('button', { name: 'Retry' });
    expect(retry).toHaveLength(2);
    fireEvent.click(retry[1]!);
    const buttons = await screen.findAllByRole('button', { name: 'Unfollow Studio' });
    await waitFor(() => buttons.forEach((button) => expect(button).toBeEnabled()));
    expect(mock.state).toHaveBeenCalledTimes(2);
    fireEvent.click(buttons[0]!);
    await waitFor(() => buttons.forEach((button) => expect(button).toBeEnabled()));
    buttons.forEach((button) => expect(button).toHaveAttribute('aria-pressed', 'true'));
    expect(screen.getAllByRole('status')).toHaveLength(2);
  });
  it('hides both owned-studio controls and opens only the clicked anonymous login dialog', async () => {
    mock.state.mockResolvedValueOnce(response(false, 403));
    const view = render(<PortfolioActions />);
    await waitFor(() => expect(screen.queryByRole('button')).toBeNull());
    view.unmount();
    mock.session = null;
    render(<PortfolioActions />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Follow Studio' })[1]!);
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(mock.follow).not.toHaveBeenCalled();
  });
  it('rejects late account reads in both controls after switching accounts', async () => {
    let finish!: (response: Response) => void;
    mock.state.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    const view = render(<PortfolioActions />);
    await waitFor(() => expect(mock.state).toHaveBeenCalledOnce());
    const signal = mock.state.mock.calls[0]![1].init.signal as AbortSignal;
    mock.session = { user: { id: 'another-visitor' } };
    view.rerender(<PortfolioActions />);
    await waitFor(() => expect(mock.state).toHaveBeenCalledTimes(2));
    await act(async () => finish(response(true)));
    expect(signal.aborted).toBe(true);
    expect(screen.getAllByRole('button', { name: 'Follow Studio' })).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Unfollow Studio' })).toBeNull();
  });
  it('does not let an old account mutation overwrite or lock the next account controls', async () => {
    let finish!: (response: Response) => void;
    mock.follow.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    const view = render(<PortfolioActions />);
    await waitFor(() =>
      screen
        .getAllByRole('button', { name: 'Follow Studio' })
        .forEach((button) => expect(button).toBeEnabled()),
    );
    fireEvent.click(screen.getAllByRole('button', { name: 'Follow Studio' })[0]!);
    mock.session = { user: { id: 'another-visitor' } };
    view.rerender(<PortfolioActions />);
    await waitFor(() =>
      screen
        .getAllByRole('button', { name: 'Follow Studio' })
        .forEach((button) => expect(button).toBeEnabled()),
    );
    await act(async () => finish(response(true)));
    screen
      .getAllByRole('button', { name: 'Follow Studio' })
      .forEach((button) => expect(button).toBeEnabled());
    expect(screen.queryByRole('button', { name: 'Unfollow Studio' })).toBeNull();
  });
  it('still notifies account-scoped listeners when a confirmed write finishes after navigation', async () => {
    let finish!: (response: Response) => void;
    mock.follow.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    const changed = vi.fn();
    window.addEventListener('tickif:following-changed', changed);
    try {
      const view = render(<PortfolioActions />);
      await waitFor(() =>
        screen
          .getAllByRole('button', { name: 'Follow Studio' })
          .forEach((button) => expect(button).toBeEnabled()),
      );
      fireEvent.click(screen.getAllByRole('button', { name: 'Follow Studio' })[0]!);
      view.unmount();
      await act(async () => finish(response(true)));
      expect(changed).toHaveBeenCalledOnce();
      expect(changed.mock.calls[0]![0].detail).toEqual({ userId: 'visitor' });
    } finally {
      window.removeEventListener('tickif:following-changed', changed);
    }
  });
});
