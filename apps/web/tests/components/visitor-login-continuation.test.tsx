import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VisitorLoginContinuation } from '../../src/components/visitor-login-continuation';

const mock = vi.hoisted(() => ({ session: vi.fn(), assign: vi.fn() }));
vi.mock('@/lib/auth-client', () => ({ authClient: { getSession: mock.session } }));
vi.mock('@/components/visitor-onboarding-form', () => ({
  VisitorOnboardingForm: ({ callbackPath }: { callbackPath?: string }) => (
    <div data-testid="welcome" data-callback={callbackPath} />
  ),
}));
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('location', { assign: mock.assign });
});
afterEach(() => vi.unstubAllGlobals());

describe('visitor sign-in continuation', () => {
  it('opens welcome for a pending personal visitor and retains the original action', async () => {
    mock.session.mockResolvedValue({
      data: { user: { role: 'visitor', status: 'pending' }, session: {} },
    });
    render(<VisitorLoginContinuation callbackPath="/projects/example?save=1" />);
    expect(await screen.findByTestId('welcome')).toHaveAttribute(
      'data-callback',
      '/projects/example?save=1',
    );
    expect(mock.assign).not.toHaveBeenCalled();
  });
  it.each(['designer', 'admin', 'superadmin'])(
    'uses server routing for a %s account',
    async (role) => {
      mock.session.mockResolvedValue({ data: { user: { role, status: 'pending' }, session: {} } });
      render(<VisitorLoginContinuation />);
      await waitFor(() =>
        expect(mock.assign).toHaveBeenCalledWith('/login?mode=browsing&authenticated=1'),
      );
      expect(screen.queryByTestId('welcome')).toBeNull();
    },
  );
  it('retries a failed session refresh without showing visitor setup', async () => {
    mock.session
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ data: { user: { role: 'visitor', status: 'active' }, session: {} } });
    const user = userEvent.setup();
    render(<VisitorLoginContinuation callbackPath="/enquiries" />);
    await user.click(await screen.findByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(mock.assign).toHaveBeenCalledWith('/enquiries'));
    expect(screen.queryByTestId('welcome')).toBeNull();
  });
});
