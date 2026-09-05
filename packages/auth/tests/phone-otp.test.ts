import { beforeEach, describe, expect, it, vi } from 'vitest';

const { settings, enqueueSms, sendEmail } = vi.hoisted(() => ({
  settings: {
    PHONE_OTP_DELIVERY: 'email',
    PHONE_OTP_EMAIL_TO: 'tester@example.com',
    PHONE_OTP_EMAIL_ALLOWED_NUMBERS: ['+919800000010'],
    RESEND_API_KEY: 'test-key',
  },
  enqueueSms: vi.fn(),
  sendEmail: vi.fn(),
}));
vi.mock('@repo/config', () => ({ config: settings }));
vi.mock('@repo/queue', () => ({ enqueueSms }));
vi.mock('../src/email.js', () => ({ sendEmail }));

import { sendPhoneOtp } from '../src/phone-otp.js';

const input = { phoneNumber: '+919800000010', code: '123456' };

describe('temporary phone OTP email delivery', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    settings.PHONE_OTP_DELIVERY = 'email';
    settings.PHONE_OTP_EMAIL_ALLOWED_NUMBERS = ['+919800000010'];
    settings.RESEND_API_KEY = 'test-key';
  });

  it('emails the generated code and phone to the configured inbox without enqueueing SMS', async () => {
    await sendPhoneOtp(input);
    expect(sendEmail).toHaveBeenCalledWith({
      to: 'tester@example.com',
      subject: 'Your Tickif test login code',
      html: expect.stringContaining(input.code),
    });
    expect(sendEmail.mock.calls[0]?.[0].html).toContain(input.phoneNumber);
    expect(enqueueSms).not.toHaveBeenCalled();
  });

  it('redirects each allowlisted phone number to the same inbox', async () => {
    settings.PHONE_OTP_EMAIL_ALLOWED_NUMBERS = ['+919800000010', '+919800000011'];
    await sendPhoneOtp({ ...input, phoneNumber: '+919800000011' });
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'tester@example.com' }));
    expect(enqueueSms).not.toHaveBeenCalled();
  });

  it('refuses to deliver a code for a phone outside the configured test allowlist', async () => {
    await expect(
      sendPhoneOtp({ ...input, phoneNumber: '+919800000011' }),
    ).rejects.toThrow('not allowed');
    expect(sendEmail).not.toHaveBeenCalled();
    expect(enqueueSms).not.toHaveBeenCalled();
  });

  it('rejects HTML in delivery input', async () => {
    await expect(sendPhoneOtp({ ...input, phoneNumber: '<script>' })).rejects.toThrow('Invalid');
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('fails closed when email credentials are missing', async () => {
    settings.RESEND_API_KEY = '';
    await expect(sendPhoneOtp(input)).rejects.toThrow('unavailable');
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('propagates delivery failures without falling back to SMS', async () => {
    sendEmail.mockRejectedValueOnce(new Error('Provider unavailable'));
    await expect(sendPhoneOtp(input)).rejects.toThrow('Provider unavailable');
    expect(enqueueSms).not.toHaveBeenCalled();
  });

  it('restores normal SMS delivery when the override is disabled', async () => {
    settings.PHONE_OTP_DELIVERY = 'sms';
    await sendPhoneOtp(input);
    expect(enqueueSms).toHaveBeenCalledWith(input);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
