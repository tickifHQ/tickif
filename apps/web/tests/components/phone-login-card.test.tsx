import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PhoneLoginCard } from '../../src/components/phone-login-card';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const mock = vi.hoisted(() => ({
  sendOtp: vi.fn(),
  verify: vi.fn(),
}));

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    phoneNumber: { sendOtp: mock.sendOtp, verify: mock.verify },
  },
}));

describe('PhoneLoginCard', () => {
  it('renders phone input and send button', () => {
    render(<PhoneLoginCard />);
    expect(screen.getByLabelText('Phone number')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send OTP' })).toBeInTheDocument();
  });

  it('disables send button when phone is empty', () => {
    render(<PhoneLoginCard />);
    expect(screen.getByRole('button', { name: 'Send OTP' })).toBeDisabled();
  });

  it('disables send button when phone has fewer than 10 digits', async () => {
    const user = userEvent.setup();
    render(<PhoneLoginCard />);
    await user.type(screen.getByLabelText('Phone number'), '12345');
    expect(screen.getByRole('button', { name: 'Send OTP' })).toBeDisabled();
  });

  it('transitions to OTP step after successful send', async () => {
    mock.sendOtp.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    render(<PhoneLoginCard />);
    await user.type(screen.getByLabelText('Phone number'), '9876543210');
    await user.click(screen.getByRole('button', { name: 'Send OTP' }));
    expect(screen.getByText(/Enter OTP/)).toBeInTheDocument();
  });

  it('shows error when sendOtp rejects', async () => {
    mock.sendOtp.mockRejectedValueOnce(new Error('Rate limited'));
    const user = userEvent.setup();
    render(<PhoneLoginCard />);
    await user.type(screen.getByLabelText('Phone number'), '9876543210');
    await user.click(screen.getByRole('button', { name: 'Send OTP' }));
    expect(screen.getByText('Rate limited')).toBeInTheDocument();
  });

  describe('OTP step', () => {
    async function goToOtpStep(user: ReturnType<typeof userEvent.setup>) {
      mock.sendOtp.mockResolvedValueOnce(undefined);
      await user.type(screen.getByLabelText('Phone number'), '9876543210');
      await user.click(screen.getByRole('button', { name: 'Send OTP' }));
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
      render(<PhoneLoginCard />);
      await goToOtpStep(user);
      expect(screen.getAllByRole('textbox')).toHaveLength(6);
    });

    it('shows the sent phone number', async () => {
      const user = userEvent.setup();
      render(<PhoneLoginCard />);
      await goToOtpStep(user);
      expect(screen.getByText(/9876543210/)).toBeInTheDocument();
    });

    it('disables verify button when OTP fields are empty', async () => {
      const user = userEvent.setup();
      render(<PhoneLoginCard />);
      await goToOtpStep(user);
      expect(screen.getByRole('button', { name: 'Verify OTP' })).toBeDisabled();
    });

    it('shows success message on verify', async () => {
      mock.verify.mockResolvedValueOnce(undefined);
      const user = userEvent.setup();
      render(<PhoneLoginCard />);
      await goToOtpStep(user);
      await fillOtp(user, '123456');
      await user.click(screen.getByRole('button', { name: 'Verify OTP' }));
      expect(screen.getByText('Signed in')).toBeInTheDocument();
    });

    it('shows error and clears code on verify failure', async () => {
      mock.verify.mockRejectedValueOnce(new Error('Invalid or expired OTP'));
      const user = userEvent.setup();
      render(<PhoneLoginCard />);
      await goToOtpStep(user);
      await fillOtp(user, '123456');
      await user.click(screen.getByRole('button', { name: 'Verify OTP' }));
      expect(screen.getByText('Invalid or expired OTP')).toBeInTheDocument();
    });

    it('shows resend button with cooldown timer', async () => {
      mock.sendOtp.mockResolvedValueOnce(undefined);
      const user = userEvent.setup();
      render(<PhoneLoginCard />);
      await goToOtpStep(user);
      expect(screen.getByText(/Resend in/)).toBeInTheDocument();
    });

    it('returns to phone step on change phone number click', async () => {
      const user = userEvent.setup();
      render(<PhoneLoginCard />);
      await goToOtpStep(user);
      await user.click(screen.getByText('Change phone number'));
      expect(screen.getByRole('button', { name: 'Send OTP' })).toBeInTheDocument();
    });
  });
});
