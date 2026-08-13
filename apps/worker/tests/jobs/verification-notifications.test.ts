import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VERIFICATION_NOTIFICATION_EVENT } from '@repo/contracts';

vi.mock('@repo/auth/email', () => ({ sendEmail: vi.fn(async () => undefined) }));
vi.mock('@repo/config', () => ({
  config: { PUBLIC_WEB_URL: 'https://tickif.example' },
}));
vi.mock('@repo/queue', () => ({ enqueueVerificationEmail: vi.fn(async () => undefined) }));
vi.mock('../../src/verification-notifications/repository.js', () => ({
  findPendingVerificationNotifications: vi.fn(),
  markVerificationNotificationEnqueued: vi.fn(async () => undefined),
  findVerificationNotification: vi.fn(),
  markVerificationNotificationSent: vi.fn(async () => undefined),
}));

const { sendEmail } = await import('@repo/auth/email');
const { enqueueVerificationEmail } = await import('@repo/queue');
const repository = await import('../../src/verification-notifications/repository.js');
const { processVerificationEmail, processVerificationNotificationSweep } =
  await import('../../src/jobs/verification-notifications.js');

const notification = {
  id: '0d8e6a2c-1b3f-4c5a-9e2d-7f1a2b3c4d5e',
  applicationId: '8bc0e9bb-9abb-4551-9579-c29d6d51acbe',
  attempt: 1,
  eventType: VERIFICATION_NOTIFICATION_EVENT.CHANGES_REQUESTED,
  recipientUserId: 'user-1',
  recipientEmail: 'designer@example.com',
  note: '<script>not html</script>',
  enqueuedAt: null,
  sentAt: null,
  createdAt: new Date('2026-08-13T00:00:00.000Z'),
};

describe('verification notifications', () => {
  beforeEach(() => vi.clearAllMocks());

  it('isolates enqueue failures and only marks successful outbox rows', async () => {
    vi.mocked(repository.findPendingVerificationNotifications).mockResolvedValue([
      notification,
      { ...notification, id: 'be59564a-056a-4f8c-96f0-baa7dc89ee25' },
    ]);
    vi.mocked(enqueueVerificationEmail)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('Redis unavailable'));

    await expect(processVerificationNotificationSweep()).resolves.toEqual({
      enqueued: 1,
      failed: 1,
    });
    expect(repository.markVerificationNotificationEnqueued).toHaveBeenCalledTimes(1);
    expect(repository.markVerificationNotificationEnqueued).toHaveBeenCalledWith(notification.id);
  });

  it('sends a retry-safe changes-requested email and escapes the admin note', async () => {
    vi.mocked(repository.findVerificationNotification).mockResolvedValue(notification);

    await processVerificationEmail(notification.id);

    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: notification.recipientEmail,
        idempotencyKey: `verification-${notification.id}`,
        html: expect.stringContaining('&lt;script&gt;not html&lt;/script&gt;'),
      }),
    );
    expect(repository.markVerificationNotificationSent).toHaveBeenCalledWith(notification.id);
  });

  it('does not resend an outbox row already marked delivered', async () => {
    vi.mocked(repository.findVerificationNotification).mockResolvedValue({
      ...notification,
      sentAt: new Date('2026-08-13T00:01:00.000Z'),
    });

    await processVerificationEmail(notification.id);

    expect(sendEmail).not.toHaveBeenCalled();
  });
});
