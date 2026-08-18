import { describe, expect, it } from 'vitest';
import { db, eq, schema } from '@repo/db';
import { makeOrganization } from '@repo/db/testing';
import { VERIFICATION_NOTIFICATION_EVENT } from '@repo/contracts';
import {
  findPendingVerificationNotifications,
  markVerificationNotificationEnqueued,
} from '../../src/verification-notifications/repository.js';

describe('verification notification outbox repository', () => {
  it('redrives stale unsent claims without selecting fresh or delivered rows', async () => {
    const now = new Date('2026-08-18T16:00:00.000Z');
    const staleBefore = new Date('2026-08-18T15:55:00.000Z');
    const organization = await makeOrganization();
    const [application] = await db
      .insert(schema.verificationApplication)
      .values({ organizationId: organization.id })
      .returning();
    const rows = await db
      .insert(schema.verificationNotificationOutbox)
      .values([
        {
          applicationId: application!.id,
          attempt: 1,
          eventType: VERIFICATION_NOTIFICATION_EVENT.APPROVED,
          recipientEmail: 'pending@example.com',
          enqueuedAt: null,
          createdAt: new Date('2026-08-18T15:40:00.000Z'),
        },
        {
          applicationId: application!.id,
          attempt: 2,
          eventType: VERIFICATION_NOTIFICATION_EVENT.APPROVED,
          recipientEmail: 'stale@example.com',
          enqueuedAt: new Date('2026-08-18T15:50:00.000Z'),
          createdAt: new Date('2026-08-18T15:41:00.000Z'),
        },
        {
          applicationId: application!.id,
          attempt: 3,
          eventType: VERIFICATION_NOTIFICATION_EVENT.APPROVED,
          recipientEmail: 'fresh@example.com',
          enqueuedAt: new Date('2026-08-18T15:59:00.000Z'),
          createdAt: new Date('2026-08-18T15:42:00.000Z'),
        },
        {
          applicationId: application!.id,
          attempt: 4,
          eventType: VERIFICATION_NOTIFICATION_EVENT.APPROVED,
          recipientEmail: 'sent@example.com',
          enqueuedAt: new Date('2026-08-18T15:50:00.000Z'),
          sentAt: new Date('2026-08-18T15:51:00.000Z'),
          createdAt: new Date('2026-08-18T15:43:00.000Z'),
        },
      ])
      .returning();

    const pending = await findPendingVerificationNotifications(50, staleBefore);

    expect(pending.map((row) => row.recipientEmail)).toEqual([
      'pending@example.com',
      'stale@example.com',
    ]);

    const stale = rows.find((row) => row.recipientEmail === 'stale@example.com')!;
    await markVerificationNotificationEnqueued(stale.id, now);
    const [refreshed] = await db
      .select({ enqueuedAt: schema.verificationNotificationOutbox.enqueuedAt })
      .from(schema.verificationNotificationOutbox)
      .where(eq(schema.verificationNotificationOutbox.id, stale.id));
    expect(refreshed?.enqueuedAt).toEqual(now);
  });
});
