import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ScrollGate } from '../../src/components/scroll-gate';

vi.mock('../../src/env', () => ({
  env: { NEXT_PUBLIC_SCROLL_GATE_LIMIT: 1 },
}));

vi.mock('../../src/components/action-login-dialog', () => ({
  ActionLoginDialog: ({
    open,
    onOpenChange,
    title,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
  }) =>
    open ? (
      <div role="dialog" aria-label={title}>
        <div data-testid="login-card" />
        <button type="button" onClick={() => onOpenChange(false)}>
          Close
        </button>
      </div>
    ) : null,
}));

describe('ScrollGate', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    Object.defineProperty(window, 'scrollY', {
      configurable: true,
      value: 0,
      writable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens a dismissible login gate after the configured scroll limit', async () => {
    render(<ScrollGate />);

    expect(screen.queryByRole('dialog', { name: 'Sign in required' })).not.toBeInTheDocument();

    act(() => {
      window.scrollY = 401;
      window.dispatchEvent(new Event('scroll'));
    });

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Sign in required' })).toBeInTheDocument();
    });
    expect(screen.getByTestId('login-card')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog', { name: 'Sign in required' })).not.toBeInTheDocument();
  });

  it('keeps the gate closed during a five-minute cooldown and requires fresh scrolling afterward', async () => {
    let now = 1_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    render(<ScrollGate />);

    act(() => {
      window.scrollY = 401;
      window.dispatchEvent(new Event('scroll'));
    });
    expect(await screen.findByRole('dialog', { name: 'Sign in required' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    act(() => {
      window.scrollY = 1_201;
      window.dispatchEvent(new Event('scroll'));
    });
    expect(screen.queryByRole('dialog', { name: 'Sign in required' })).not.toBeInTheDocument();

    now += 5 * 60_000 - 1;
    act(() => {
      window.scrollY = 1_601;
      window.dispatchEvent(new Event('scroll'));
    });
    expect(screen.queryByRole('dialog', { name: 'Sign in required' })).not.toBeInTheDocument();

    now += 1;
    act(() => {
      window.scrollY = 2_001;
      window.dispatchEvent(new Event('scroll'));
    });
    expect(screen.getByRole('dialog', { name: 'Sign in required' })).toBeInTheDocument();
  });

  it('preserves the dismissal cooldown when the public layout remounts', async () => {
    let now = 1_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const { unmount } = render(<ScrollGate />);

    act(() => {
      window.scrollY = 401;
      window.dispatchEvent(new Event('scroll'));
    });
    expect(await screen.findByRole('dialog', { name: 'Sign in required' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    unmount();

    render(<ScrollGate />);
    act(() => {
      window.scrollY = 801;
      window.dispatchEvent(new Event('scroll'));
    });
    expect(screen.queryByRole('dialog', { name: 'Sign in required' })).not.toBeInTheDocument();

    now += 5 * 60_000;
    act(() => {
      window.scrollY = 1_201;
      window.dispatchEvent(new Event('scroll'));
    });
    expect(screen.getByRole('dialog', { name: 'Sign in required' })).toBeInTheDocument();
  });
});
