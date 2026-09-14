import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ActionLoginDialog } from '../../src/components/action-login-dialog';

vi.mock('@/components/login-card', () => ({
  LoginCard: ({ callbackPath, onClose }: { callbackPath?: string; onClose: () => void }) => (
    <div data-testid="login-card" data-callback-path={callbackPath}>
      <button type="button" onClick={onClose}>
        Close login
      </button>
    </div>
  ),
}));

describe('ActionLoginDialog', () => {
  it('opens over a blurred backdrop and preserves a safe return path', () => {
    const onOpenChange = vi.fn();
    render(
      <ActionLoginDialog
        open
        onOpenChange={onOpenChange}
        loginHref="/login?callbackURL=%2Fprojects%2Fproject-1"
      />,
    );

    expect(screen.getByRole('dialog', { name: 'Sign in to continue' })).toHaveClass(
      'max-w-[calc(100%-2rem)]',
      'sm:max-w-3xl',
    );
    expect(screen.getByTestId('login-card')).toHaveAttribute(
      'data-callback-path',
      '/projects/project-1',
    );
    expect(document.querySelector('[data-slot="dialog-overlay"]')).toHaveClass('backdrop-blur-sm');

    fireEvent.click(screen.getByRole('button', { name: 'Close login' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('drops an unsafe external return path', () => {
    render(
      <ActionLoginDialog
        open
        onOpenChange={() => undefined}
        loginHref="/login?callbackURL=%2F%2Fevil.example"
      />,
    );

    expect(screen.getByTestId('login-card')).not.toHaveAttribute('data-callback-path');
  });
});
