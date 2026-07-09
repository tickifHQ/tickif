import { beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginCard } from '../../src/components/login-card';

const mock = vi.hoisted(() => ({
  router: {
    push: vi.fn(),
  },
  sendOtp: vi.fn(),
  verify: vi.fn(),
  signInSocial: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => mock.router,
}));

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    phoneNumber: { sendOtp: mock.sendOtp, verify: mock.verify },
    signIn: { social: mock.signInSocial },
  },
}));

describe('LoginCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    document.cookie = 'tickif_visitor_onboarded=; Max-Age=0; Path=/';
  });

  it('renders trusted-by badge, welcome title, and phone input', () => {
    render(<LoginCard />);
    expect(screen.getByText('Trusted by 5000+ homeowners')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Welcome to Tickif' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /phone/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Get OTP' })).toBeInTheDocument();
  });

  it('renders segmented control with browsing and designer tabs', () => {
    render(<LoginCard />);
    expect(screen.getByRole('tab', { name: /i'm browsing/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /i'm a designer/i })).toBeInTheDocument();
  });

  it('shows browsing features by default', () => {
    render(<LoginCard />);
    expect(screen.getByTestId('feature-save-what-you-love')).toBeInTheDocument();
    expect(screen.getByTestId('feature-message-designers')).toBeInTheDocument();
    expect(screen.getByTestId('feature-book-free-consultations')).toBeInTheDocument();
  });

  it('shows designer features when designer tab is selected', async () => {
    const user = userEvent.setup();
    render(<LoginCard />);
    await user.click(screen.getByRole('tab', { name: /i'm a designer/i }));
    expect(screen.getByTestId('feature-share-your-work-anywhere')).toBeInTheDocument();
    expect(screen.getByTestId('feature-get-bookings-from-home-owners')).toBeInTheDocument();
    expect(screen.getByTestId('feature-turn-visitors-into-clients')).toBeInTheDocument();
  });

  it('can open with designer mode selected', () => {
    render(<LoginCard initialMode="designer" />);
    expect(screen.getByRole('tab', { name: /i'm a designer/i })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByTestId('feature-share-your-work-anywhere')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /login with google/i })).toBeInTheDocument();
  });

  it('shows designer-specific promo subtitle when designer tab is active', async () => {
    const user = userEvent.setup();
    render(<LoginCard />);
    await user.click(screen.getByRole('tab', { name: /i'm a designer/i }));
    expect(screen.getByText(/One link to share your work/)).toBeInTheDocument();
  });

  it('shows Google sign-in in browsing mode', () => {
    render(<LoginCard />);
    expect(screen.getByRole('button', { name: /continue with google/i })).toBeInTheDocument();
    expect(screen.getByText(/Tickif's Terms & Privacy/)).toBeInTheDocument();
  });

  it('renders a close button and calls onClose when provided', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<LoginCard onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows Google sign-in, email input, and button in designer mode', async () => {
    const user = userEvent.setup();
    render(<LoginCard />);
    await user.click(screen.getByRole('tab', { name: /i'm a designer/i }));
    expect(screen.getByRole('button', { name: /login with google/i })).toBeInTheDocument();
    expect(screen.getAllByText('OR')).toHaveLength(2);
    expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Login' })).toBeDisabled();
  });

  it('calls Google signIn with origin callback in browsing mode', async () => {
    mock.signInSocial.mockResolvedValueOnce({ error: null, url: 'https://accounts.google.com/...' });
    const user = userEvent.setup();
    render(<LoginCard />);
    await user.click(screen.getByRole('button', { name: /continue with google/i }));
    expect(mock.signInSocial).toHaveBeenCalledWith({
      provider: 'google',
      callbackURL: 'http://localhost:3000/onboarding',
    });
  });

  it('sends completed visitors home after Google sign in', async () => {
    window.localStorage.setItem('tickif.visitorOnboarding', JSON.stringify({ displayName: 'Mahi', city: 'chennai' }));
    mock.signInSocial.mockResolvedValueOnce({ error: null, url: 'https://accounts.google.com/...' });
    const user = userEvent.setup();
    render(<LoginCard />);
    await user.click(screen.getByRole('button', { name: /continue with google/i }));
    expect(mock.signInSocial).toHaveBeenCalledWith({
      provider: 'google',
      callbackURL: 'http://localhost:3000/',
    });
  });


  it('calls Google signIn with onboarding callback in designer mode', async () => {
    mock.signInSocial.mockResolvedValueOnce({ error: null, url: 'https://accounts.google.com/...' });
    const user = userEvent.setup();
    render(<LoginCard />);
    await user.click(screen.getByRole('tab', { name: /i'm a designer/i }));
    await user.click(screen.getByRole('button', { name: /login with google/i }));
    expect(mock.signInSocial).toHaveBeenCalledWith({
      provider: 'google',
      callbackURL: 'http://localhost:3000/designer/onboarding',
    });
  });

  it('shows error when Google signIn fails in browsing mode', async () => {
    mock.signInSocial.mockResolvedValueOnce({ error: 'Provider not found' });
    const user = userEvent.setup();
    render(<LoginCard />);
    await user.click(screen.getByRole('button', { name: /continue with google/i }));
    expect(screen.getByText('Couldn\'t sign in with Google')).toBeInTheDocument();
  });

  it('shows error when Google signIn fails in designer mode', async () => {
    mock.signInSocial.mockResolvedValueOnce({ error: 'Provider not found' });
    const user = userEvent.setup();
    render(<LoginCard />);
    await user.click(screen.getByRole('tab', { name: /i'm a designer/i }));
    await user.click(screen.getByRole('button', { name: /login with google/i }));
    expect(screen.getByText('Couldn\'t sign in with Google')).toBeInTheDocument();
  });

  it('disables Send OTP button when phone is empty', () => {
    render(<LoginCard />);
    expect(screen.getByRole('button', { name: 'Get OTP' })).toBeDisabled();
  });

  it('disables Send OTP button when phone has fewer than 10 digits', async () => {
    const user = userEvent.setup();
    render(<LoginCard />);
    await user.type(screen.getByRole('textbox', { name: /phone/i }), '12345');
    expect(screen.getByRole('button', { name: 'Get OTP' })).toBeDisabled();
  });

  it('transitions to OTP step after successful send', async () => {
    mock.sendOtp.mockResolvedValueOnce({ data: null, error: null });
    const user = userEvent.setup();
    render(<LoginCard />);
    await user.type(screen.getByRole('textbox', { name: /phone/i }), '9876543210');
    await user.click(screen.getByRole('button', { name: 'Get OTP' }));
    expect(screen.getByText('Enter verification code')).toBeInTheDocument();
  });

  it('shows error when sendOtp fails', async () => {
    mock.sendOtp.mockResolvedValueOnce({ data: null, error: { message: 'Invalid phone number' } });
    const user = userEvent.setup();
    render(<LoginCard />);
    await user.type(screen.getByRole('textbox', { name: /phone/i }), '9876543210');
    await user.click(screen.getByRole('button', { name: 'Get OTP' }));
    expect(screen.getByText('Invalid phone number')).toBeInTheDocument();
  });

  it('shows error when sendOtp rejects', async () => {
    mock.sendOtp.mockRejectedValueOnce(new Error('Rate limited'));
    const user = userEvent.setup();
    render(<LoginCard />);
    await user.type(screen.getByRole('textbox', { name: /phone/i }), '9876543210');
    await user.click(screen.getByRole('button', { name: 'Get OTP' }));
    expect(screen.getByText('Rate limited')).toBeInTheDocument();
  });

  describe('OTP step', () => {
    async function goToOtpStep(user: ReturnType<typeof userEvent.setup>) {
      mock.sendOtp.mockResolvedValueOnce({ data: null, error: null });
      await user.type(screen.getByRole('textbox', { name: /phone/i }), '9876543210');
      await user.click(screen.getByRole('button', { name: 'Get OTP' }));
      await screen.findByText('Enter verification code');
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

    it('disables Continue when OTP fields are empty', async () => {
      const user = userEvent.setup();
      render(<LoginCard />);
      await goToOtpStep(user);
      expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    });

    it('shows success message on verify', async () => {
      mock.verify.mockResolvedValueOnce({ data: null, error: null });
      const user = userEvent.setup();
      render(<LoginCard />);
      await goToOtpStep(user);
      await fillOtp(user, '123456');
      await user.click(screen.getByRole('button', { name: 'Continue' }));
      expect(screen.getByText('Signed in')).toBeInTheDocument();
    });

    it('shows error on verify failure', async () => {
      mock.verify.mockResolvedValueOnce({ data: null, error: { message: 'Invalid or expired OTP' } });
      const user = userEvent.setup();
      render(<LoginCard />);
      await goToOtpStep(user);
      await fillOtp(user, '123456');
      await user.click(screen.getByRole('button', { name: 'Continue' }));
      expect(screen.getByText('Invalid or expired OTP')).toBeInTheDocument();
    });

    it('hides browsing form during OTP step', async () => {
      const user = userEvent.setup();
      render(<LoginCard />);
      await goToOtpStep(user);
      expect(screen.queryByRole('button', { name: /continue with google/i })).not.toBeInTheDocument();
    });

    it('returns to phone step on Cancel click', async () => {
      const user = userEvent.setup();
      render(<LoginCard />);
      await goToOtpStep(user);
      await user.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(screen.getByRole('button', { name: 'Get OTP' })).toBeInTheDocument();
    });

    it('calls onSuccess callback on verify instead of router.push', async () => {
      const onSuccess = vi.fn();
      mock.verify.mockResolvedValueOnce({ data: null, error: null });
      const user = userEvent.setup();
      render(<LoginCard onSuccess={onSuccess} />);
      await goToOtpStep(user);
      await fillOtp(user, '123456');
      await user.click(screen.getByRole('button', { name: 'Continue' }));
      expect(onSuccess).toHaveBeenCalled();
    });
  });
});
