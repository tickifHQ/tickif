import { config } from '@repo/config';
import { enqueueSms } from '@repo/queue';
import { sendEmail } from './email.js';

/** Change delivery only; better-auth still owns code generation and verification. */
export async function sendPhoneOtp(input: { phoneNumber: string; code: string }): Promise<void> {
  if (config.PHONE_OTP_DELIVERY !== 'email') {
    await enqueueSms(input);
    return;
  }

  if (!config.PHONE_OTP_EMAIL_TO || !config.RESEND_API_KEY) {
    throw new Error('Phone OTP email delivery is unavailable');
  }

  // Both values are constrained before interpolation; never include arbitrary HTML.
  if (!/^\+[1-9]\d{7,14}$/.test(input.phoneNumber) || !/^\d{6}$/.test(input.code)) {
    throw new Error('Invalid phone OTP delivery input');
  }
  if (!config.PHONE_OTP_EMAIL_ALLOWED_NUMBERS.includes(input.phoneNumber)) {
    throw new Error('Phone OTP email delivery is not allowed for this number');
  }

  await sendEmail({
    to: config.PHONE_OTP_EMAIL_TO,
    subject: 'Your Tickif test login code',
    html: `<h2>Tickif test login</h2><p>Phone: ${input.phoneNumber}</p><p>Your code is <strong>${input.code}</strong>.</p><p>This code expires in 5 minutes.</p>`,
  });
}
