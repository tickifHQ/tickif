import { sendEmail } from '@repo/auth/email';
import { config } from '@repo/config';
import { VERIFICATION_NOTIFICATION_EVENT } from '@repo/contracts';
import { enqueueVerificationEmail } from '@repo/queue';
import {
  findPendingVerificationNotifications,
  findVerificationNotification,
  markExhaustedVerificationNotifications,
  markVerificationNotificationEnqueued,
  markVerificationNotificationSent,
} from '../verification-notifications/repository.js';

const DISPATCH_BATCH_SIZE = 50;
const STALE_CLAIM_MS = 5 * 60 * 1000;
const MAX_DELIVERY_ATTEMPTS = 5;

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export async function processVerificationNotificationSweep(): Promise<{
  enqueued: number;
  failed: number;
  exhausted: number;
}> {
  const staleBefore = new Date(Date.now() - STALE_CLAIM_MS);
  const exhausted = await markExhaustedVerificationNotifications(
    MAX_DELIVERY_ATTEMPTS,
    staleBefore,
  );
  const pending = await findPendingVerificationNotifications(
    DISPATCH_BATCH_SIZE,
    staleBefore,
    MAX_DELIVERY_ATTEMPTS,
  );
  let enqueued = 0;
  let failed = 0;
  for (const notification of pending) {
    try {
      await enqueueVerificationEmail({
        kind: 'verification-email',
        outboxId: notification.id,
      });
      await markVerificationNotificationEnqueued(notification.id);
      enqueued += 1;
    } catch (error) {
      failed += 1;
      console.error(`[worker] verification notification ${notification.id} enqueue failed:`, error);
    }
  }
  return { enqueued, failed, exhausted };
}

export async function processVerificationEmail(outboxId: string): Promise<void> {
  const notification = await findVerificationNotification(outboxId);
  if (!notification || notification.sentAt || notification.failedAt) return;

  const changesRequested =
    notification.eventType === VERIFICATION_NOTIFICATION_EVENT.CHANGES_REQUESTED;
  const approvalRevoked =
    notification.eventType === VERIFICATION_NOTIFICATION_EVENT.APPROVAL_REVOKED;
  const note =
    (changesRequested || approvalRevoked) && notification.note
      ? `<p><strong>Reviewer note:</strong> ${escapeHtml(notification.note)}</p>`
      : '';
  const title = approvalRevoked
    ? 'Your Tickif verification is under review again'
    : changesRequested
      ? 'Changes requested for your Tickif verification'
      : 'Your Tickif verification is approved';
  const action = approvalRevoked
    ? 'Your verified status has been removed while the Tickif Review Team reviews your profile again.'
    : changesRequested
      ? 'Review the note, replace the requested documents, and resubmit your verification.'
      : 'Your verified status is now visible on Tickif.';
  const verificationUrl = new URL('/designer/verification', config.PUBLIC_WEB_URL).toString();

  await sendEmail({
    to: notification.recipientEmail,
    subject: title,
    idempotencyKey: `verification-${notification.id}`,
    html: `<h1>${title}</h1><p>${action}</p>${note}<p><a href="${verificationUrl}">Open verification</a></p>`,
  });
  await markVerificationNotificationSent(notification.id);
}
