import { sendEmail, type SendEmailParams } from './email.js';

/** Deliver a notification without rolling back the completed domain action. */
export async function sendNotificationEmail(
  kind: 'organization-invitation' | 'organization-invitation-declined',
  message: SendEmailParams,
): Promise<boolean> {
  try {
    await sendEmail(message);
    return true;
  } catch {
    console.error(`[email] ${kind} delivery failed`);
    return false;
  }
}
