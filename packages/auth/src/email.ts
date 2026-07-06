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
    // Dev fallback: log to console
    console.log(`[email] TO: ${to} | SUBJECT: ${subject}`);
    console.log(`[email] HTML:\n${html}\n`);
    return;
  }

  try {
    const result = await resend.emails.send({
      from: emailFrom,
      to,
      subject,
      html,
    });
    console.log(`[email] Sent to ${to}: ${result.data?.id ?? 'no-id'}`);
  } catch (err) {
    console.error(`[email] FAILED to send to ${to}:`, err);
  }
}
