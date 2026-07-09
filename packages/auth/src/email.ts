import { Resend } from 'resend';
import { config } from '@repo/config';

/**
 * Email delivery via Resend.
 *
 * In development (no RESEND_API_KEY), emails are logged to console.
 * In production, emails are delivered via the Resend API.
 */

const resendApiKey = config.RESEND_API_KEY;
const emailFrom = config.EMAIL_FROM;

const resend = resendApiKey ? new Resend(resendApiKey) : null;

type SendEmailParams = {
  to: string;
  subject: string;
  html: string;
};

export async function sendEmail({ to, subject, html }: SendEmailParams): Promise<void> {
  if (!resend) {
    if (config.NODE_ENV === 'production') {
      throw new Error('[email] RESEND_API_KEY is required in production');
    }
    // Dev fallback: log subject only (never log OTP-containing HTML in case logs are shared)
    console.log(`[email] TO: ${to} | SUBJECT: ${subject}`);
    return;
  }

  const result = await resend.emails.send({
    from: emailFrom,
    to,
    subject,
    html,
  });

  if (result.error) {
    throw new Error(`[email] FAILED to send to ${to}: ${result.error.message}`);
  }

  console.log(`[email] Sent to ${to}: ${result.data?.id ?? 'no-id'}`);
}
