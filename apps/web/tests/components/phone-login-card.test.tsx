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
});
