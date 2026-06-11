import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginCard } from '../../src/components/login-card';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const mock = vi.hoisted(() => ({
  sendOtp: vi.fn(),
  verify: vi.fn(),
  signInSocial: vi.fn(),
}));

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    phoneNumber: { sendOtp: mock.sendOtp, verify: mock.verify },
    signIn: { social: mock.signInSocial },
  },
}));

describe('LoginCard', () => {
  it('renders badge, title, and phone input', () => {
    render(<LoginCard />);
    expect(screen.getByText('Trusted by 50,000+ homeowners')).toBeInTheDocument();
    expect(screen.getByText('Unlock 12,400+ real homes')).toBeInTheDocument();
    expect(screen.getByLabelText('Phone Number')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Login' })).toBeInTheDocument();
  });

  it('renders Google sign-in option', () => {
    render(<LoginCard />);
    expect(screen.getByText('Continue with Google')).toBeInTheDocument();
    expect(screen.getByText('By continuing you agree to our Terms and Privacy policy.')).toBeInTheDocument();
  });

  it('disables Login button when phone is empty', () => {
    render(<LoginCard />);
    expect(screen.getByRole('button', { name: 'Login' })).toBeDisabled();
  });

  it('disables Login button when phone has fewer than 10 digits', async () => {
    const user = userEvent.setup();
    render(<LoginCard />);
    await user.type(screen.getByLabelText('Phone Number'), '12345');
    expect(screen.getByRole('button', { name: 'Login' })).toBeDisabled();
  });

  it('transitions to OTP step after successful send', async () => {
    mock.sendOtp.mockResolvedValueOnce({ data: null, error: null });
    const user = userEvent.setup();
    render(<LoginCard />);
    await user.type(screen.getByLabelText('Phone Number'), '9876543210');
    await user.click(screen.getByRole('button', { name: 'Login' }));
    expect(screen.getByText(/Enter OTP/)).toBeInTheDocument();
  });

  it('shows error when sendOtp fails', async () => {
    mock.sendOtp.mockResolvedValueOnce({ data: null, error: { message: 'Invalid phone number' } });
    const user = userEvent.setup();
    render(<LoginCard />);
    await user.type(screen.getByLabelText('Phone Number'), '9876543210');
    await user.click(screen.getByRole('button', { name: 'Login' }));
    expect(screen.getByText('Invalid phone number')).toBeInTheDocument();
  });

  it('shows error when sendOtp rejects', async () => {
    mock.sendOtp.mockRejectedValueOnce(new Error('Rate limited'));
    const user = userEvent.setup();
    render(<LoginCard />);
    await user.type(screen.getByLabelText('Phone Number'), '9876543210');
    await user.click(screen.getByRole('button', { name: 'Login' }));
    expect(screen.getByText('Rate limited')).toBeInTheDocument();
  });

  it('calls Google signIn on Google button click', async () => {
    mock.signInSocial.mockResolvedValueOnce({ error: null, url: 'https://accounts.google.com/...' });
    const user = userEvent.setup();
    render(<LoginCard />);
    await user.click(screen.getByText('Continue with Google'));
    expect(mock.signInSocial).toHaveBeenCalledWith({ provider: 'google', callbackURL: 'http://localhost:3000' });
  });

  it('shows error when Google signIn fails', async () => {
    mock.signInSocial.mockResolvedValueOnce({ error: 'Provider not found' });
    const user = userEvent.setup();
    render(<LoginCard />);
    await user.click(screen.getByText('Continue with Google'));
    expect(screen.getByText('Couldn\'t sign in with Google')).toBeInTheDocument();
  });

  describe('OTP step', () => {
    async function goToOtpStep(user: ReturnType<typeof userEvent.setup>) {
      mock.sendOtp.mockResolvedValueOnce({ data: null, error: null });
      await user.type(screen.getByLabelText('Phone Number'), '9876543210');
      await user.click(screen.getByRole('button', { name: 'Login' }));
      await screen.findByText(/Enter OTP/);
    }

    async function fillOtp(user: ReturnType<typeof userEvent.setup>, digits: string) {
      const inputs = screen.getAllByRole('textbox');
      for (const [i, digit] of digits.split('').entries()) {
        await user.type(inputs[i]!, digit);
      }
    }

    it('renders 6 OTP input fields', async () => {
      const user = userEvent.setup();
      render(<LoginCard />);
      await goToOtpStep(user);
      expect(screen.getAllByRole('textbox')).toHaveLength(6);
    });

    it('shows the sent phone number', async () => {
      const user = userEvent.setup();
      render(<LoginCard />);
      await goToOtpStep(user);
      expect(screen.getByText(/9876543210/)).toBeInTheDocument();
    });

    it('disables verify when OTP fields are empty', async () => {
      const user = userEvent.setup();
      render(<LoginCard />);
      await goToOtpStep(user);
      expect(screen.getByRole('button', { name: 'Verify OTP' })).toBeDisabled();
    });

    it('shows success message on verify', async () => {
      mock.verify.mockResolvedValueOnce({ data: null, error: null });
      const user = userEvent.setup();
      render(<LoginCard />);
      await goToOtpStep(user);
      await fillOtp(user, '123456');
      await user.click(screen.getByRole('button', { name: 'Verify OTP' }));
      expect(screen.getByText('Signed in')).toBeInTheDocument();
    });

    it('shows error on verify failure', async () => {
      mock.verify.mockResolvedValueOnce({ data: null, error: { message: 'Invalid or expired OTP' } });
      const user = userEvent.setup();
      render(<LoginCard />);
      await goToOtpStep(user);
      await fillOtp(user, '123456');
      await user.click(screen.getByRole('button', { name: 'Verify OTP' }));
      expect(screen.getByText('Invalid or expired OTP')).toBeInTheDocument();
    });

    it('hides Google sign-in during OTP step', async () => {
      const user = userEvent.setup();
      render(<LoginCard />);
      await goToOtpStep(user);
      expect(screen.queryByText('Continue with Google')).not.toBeInTheDocument();
    });

    it('returns to phone step on change phone number click', async () => {
      const user = userEvent.setup();
      render(<LoginCard />);
      await goToOtpStep(user);
      await user.click(screen.getByText('Change phone number'));
      expect(screen.getByRole('button', { name: 'Login' })).toBeInTheDocument();
    });
  });
});
