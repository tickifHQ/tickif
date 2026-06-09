import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GoogleLoginButton } from '../../src/components/google-login-button';

const mock = vi.hoisted(() => ({
  signInSocial: vi.fn(),
}));

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    signIn: { social: mock.signInSocial },
  },
}));

describe('GoogleLoginButton', () => {
  it('renders with default text', () => {
    render(<GoogleLoginButton />);
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeInTheDocument();
  });

  it('calls signIn.social with google and callbackURL on click', async () => {
    mock.signInSocial.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    render(<GoogleLoginButton />);
    await user.click(screen.getByRole('button', { name: 'Continue with Google' }));
    expect(mock.signInSocial).toHaveBeenCalledWith({ provider: 'google', callbackURL: 'http://localhost:3000' });
  });

  it('shows error when signIn returns a truthy error', async () => {
    mock.signInSocial.mockResolvedValueOnce({ error: 'Provider not found' });
    const user = userEvent.setup();
    render(<GoogleLoginButton />);
    await user.click(screen.getByRole('button', { name: 'Continue with Google' }));
    expect(screen.getByText('Google sign-in is not configured')).toBeInTheDocument();
  });

  it('does not show error when signIn returns null error', async () => {
    mock.signInSocial.mockResolvedValueOnce({ error: null, url: 'https://accounts.google.com/...' });
    const user = userEvent.setup();
    render(<GoogleLoginButton />);
    await user.click(screen.getByRole('button', { name: 'Continue with Google' }));
    expect(screen.queryByText('Google sign-in is not configured')).not.toBeInTheDocument();
  });

  it('shows error when signIn throws', async () => {
    mock.signInSocial.mockRejectedValueOnce(new Error('Network error'));
    const user = userEvent.setup();
    render(<GoogleLoginButton />);
    await user.click(screen.getByRole('button', { name: 'Continue with Google' }));
    expect(screen.getByText('Google sign-in is not available')).toBeInTheDocument();
  });
});
