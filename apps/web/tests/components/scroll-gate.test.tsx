import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ScrollGate } from '../../src/components/scroll-gate';

vi.mock('../../src/components/login-card', () => ({
  LoginCard: ({ onClose }: { onClose?: () => void }) => (
    <div data-testid="login-card">
      {onClose && (
        <button type="button" onClick={onClose}>
          Close
        </button>
      )}
    </div>
  ),
}));

describe('ScrollGate', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SCROLL_GATE_LIMIT = '1';
    Object.defineProperty(window, 'scrollY', {
      configurable: true,
      value: 0,
      writable: true,
    });
  });

  it('opens an irreversible login gate after the configured scroll limit', async () => {
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
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
  });
});
