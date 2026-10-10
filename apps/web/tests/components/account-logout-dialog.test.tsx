import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { useRef, useState } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AccountLogoutDialog } from '@/components/account-logout-dialog';

const mock = vi.hoisted(() => ({ signOut: vi.fn(), revokeOtherSessions: vi.fn(), focus: vi.fn() }));
vi.mock('@/lib/auth-client', () => ({ authClient: mock }));

function Harness() {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button onClick={() => setOpen(true)}>Reopen</button>
      <AccountLogoutDialog open={open} onOpenChange={setOpen} onCloseFocus={mock.focus} />
    </>
  );
}

beforeEach(() => {
  mock.signOut.mockReset().mockResolvedValue({ error: null });
  mock.revokeOtherSessions.mockReset().mockResolvedValue({ error: null });
  mock.focus.mockReset();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function AnchoredHarness() {
  const anchorRef = useRef<HTMLDivElement>(null);
  return (
    <>
      <div ref={anchorRef}>Account panel</div>
      <AccountLogoutDialog
        open
        anchorRef={anchorRef}
        onOpenChange={vi.fn()}
        onCloseFocus={mock.focus}
      />
    </>
  );
}

describe('AccountLogoutDialog', () => {
  it('uses the scoped neutral account backdrop instead of the shared green overlay', () => {
    render(<Harness />);
    expect(document.querySelector('[data-slot="dialog-overlay"]')).toHaveClass(
      'bg-account-menu-overlay',
    );
  });

  it('positions confirmation left of the menu, keeps it in view, and adapts to resizing and errors', () => {
    let menuLeft = 900;
    let menuBottom = 500;
    let dialogHeight = 328;
    let resize = () => {};
    const disconnect = vi.fn();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          resize = callback;
        }
        observe() {}
        disconnect = disconnect;
      },
    );
    vi.stubGlobal('innerHeight', 640);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({
      left: menuLeft,
      bottom: menuBottom,
      right: menuLeft + 296,
      top: menuBottom - 415,
      width: 296,
      height: 415,
      x: menuLeft,
      y: menuBottom - 415,
      toJSON: () => ({}),
    }));
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(360);
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(() => dialogHeight);
    const getComputedStyle = window.getComputedStyle.bind(window);
    vi.spyOn(window, 'getComputedStyle').mockImplementation(
      (element) =>
        new Proxy(getComputedStyle(element), {
          get(style, property) {
            if (property === 'marginRight') return '16px';
            const value = Reflect.get(style, property, style);
            return typeof value === 'function' ? value.bind(style) : value;
          },
        }),
    );
    const { unmount } = render(<AnchoredHarness />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveStyle({ left: '524px', top: '172px' });
    dialogHeight = 600;
    act(() => resize());
    expect(dialog).toHaveStyle({ top: '16px' });
    // No overlap or off-screen anchoring on narrow screens.
    menuLeft = 24;
    act(() => resize());
    expect(dialog.style.left).toBe('');
    menuLeft = 900;
    menuBottom = 800;
    dialogHeight = 328;
    act(() => window.dispatchEvent(new Event('resize')));
    expect(dialog).toHaveStyle({ left: '524px', top: '296px' });
    unmount();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it('cancels without revoking anything, resets the checkbox, and restores focus', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(mock.signOut).not.toHaveBeenCalled();
    expect(mock.revokeOtherSessions).not.toHaveBeenCalled();
    await waitFor(() => expect(mock.focus).toHaveBeenCalled());
    await user.click(screen.getByRole('button', { name: 'Reopen' }));
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('revokes other sessions before removing the current session and cookie', async () => {
    const navigate = vi.spyOn(window.location, 'replace').mockImplementation(() => undefined);
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Log out' }));
    expect(mock.revokeOtherSessions).toHaveBeenCalledTimes(1);
    expect(mock.signOut).toHaveBeenCalledTimes(1);
    expect(mock.revokeOtherSessions.mock.invocationCallOrder[0]).toBeLessThan(
      mock.signOut.mock.invocationCallOrder[0]!,
    );
    expect(navigate).toHaveBeenCalledWith('/login');
  });

  it.each(['returned', 'network'])(
    'retains a usable session when other-device revocation fails: %s',
    async (failure) => {
      const navigate = vi.spyOn(window.location, 'replace').mockImplementation(() => undefined);
      if (failure === 'returned')
        mock.revokeOtherSessions.mockResolvedValue({ error: { status: 403 } });
      else mock.revokeOtherSessions.mockRejectedValue(new Error('offline'));
      const user = userEvent.setup();
      render(<Harness />);
      await user.click(screen.getByRole('checkbox'));
      await user.click(screen.getByRole('button', { name: 'Log out' }));
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(mock.signOut).not.toHaveBeenCalled();
      expect(navigate).not.toHaveBeenCalled();
      await user.click(screen.getByRole('checkbox'));
      await user.click(screen.getByRole('button', { name: 'Log out' }));
      expect(navigate).toHaveBeenCalledWith('/login');
    },
  );

  it('keeps returned sign-out errors retryable', async () => {
    const navigate = vi.spyOn(window.location, 'replace').mockImplementation(() => undefined);
    mock.signOut.mockResolvedValue({ error: { status: 500 } });
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Log out' }));
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('blocks duplicate submission and dismissal while logout is pending', async () => {
    let complete: (value: { error: null }) => void = () => {
      throw new Error('not pending');
    };
    mock.signOut.mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    vi.spyOn(window.location, 'replace').mockImplementation(() => undefined);
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Log out' }));
    expect(screen.getByRole('button', { name: 'Logging out...' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('checkbox')).toBeDisabled();
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(mock.signOut).toHaveBeenCalledTimes(1);
    complete({ error: null });
    await waitFor(() => expect(window.location.replace).toHaveBeenCalledWith('/login'));
  });
});
