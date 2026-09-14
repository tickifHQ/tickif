import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
    Object.defineProperty(window, 'scrollY', {
      configurable: true,
      value: 0,
      writable: true,
    });
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
});
