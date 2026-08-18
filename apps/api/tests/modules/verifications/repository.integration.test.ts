import { describe, expect, it } from 'vitest';
import { db, eq, schema } from '@repo/db';
import { makeDesigner, makeOrganization, makeProject, makeUser } from '@repo/db/testing';
import {
  ORGANIZATION_MEMBER_ROLE,
  PLATFORM_ROLE,
  VERIFICATION_APPLICATION_STATUS,
  VERIFICATION_DOCUMENT_STATUS,
  VERIFICATION_NOTIFICATION_EVENT,
  VERIFICATION_REVIEW_ACTION,
} from '@repo/contracts';
import {
  VERIFICATION_MUTATION_RESULT,
  verificationsRepository,
} from '../../../src/modules/verifications/repository.js';

async function setupApplication() {
  const owner = await makeUser({
    name: 'Legal Owner',
    phoneNumber: '+919800000010',
    phoneNumberVerified: true,
  });
  const organization = await makeOrganization();
  await db.insert(schema.member).values({
    id: `member-${owner.id}`,
    organizationId: organization.id,
    userId: owner.id,
    role: ORGANIZATION_MEMBER_ROLE.OWNER,
    createdAt: new Date(),
  });
  const profile = await makeDesigner({
    orgId: organization.id,
    userId: owner.id,
    displayName: 'Verified Studio',
    status: 'active',
  });
  const application = await verificationsRepository.getOrCreateForOrganization(organization.id);
  return { owner, organization, profile, application };
}

describe('verification repository lifecycle', () => {
  it('keeps document versions immutable and tenant scoped', async () => {
    const { owner, organization, application } = await setupApplication();
    const otherOrganization = await makeOrganization();

    const first = await verificationsRepository.reserveDocumentVersion({
      applicationId: application.id,
      documentVersionId: '8bc0e9bb-9abb-4551-9579-c29d6d51acbe',
      type: 'gst_registration_certificate',
      objectKey: 'verification-documents/org/version-1',
      contentType: 'application/pdf',
      contentLength: 1000,
      userId: owner.id,
    });
    const second = await verificationsRepository.reserveDocumentVersion({
      applicationId: application.id,
      documentVersionId: '9c08cc34-697a-455a-8b66-41c193402174',
      type: 'gst_registration_certificate',
      objectKey: 'verification-documents/org/version-2',
      contentType: 'application/pdf',
      contentLength: 1200,
      userId: owner.id,
    });

    expect(typeof first).not.toBe('string');
    expect(typeof second).not.toBe('string');
    if (typeof first === 'string' || typeof second === 'string') return;
    expect([first.version, second.version]).toEqual([1, 2]);
    await expect(
      verificationsRepository.findDocumentForOrganization(first.id, otherOrganization.id),
    ).resolves.toBeNull();
    await expect(
      verificationsRepository.findDocumentForOrganization(first.id, organization.id),
    ).resolves.toMatchObject({ id: first.id });
  });

  it('atomically records approval, notification intent, and search projection work', async () => {
    const { owner, profile, application } = await setupApplication();
    const reviewer = await makeUser({ role: PLATFORM_ROLE.ADMIN });
    await Promise.all([
      makeProject({ designerId: profile.id, status: 'published' }),
      makeProject({ designerId: profile.id, status: 'published' }),
      makeProject({ designerId: profile.id, status: 'published' }),
    ]);
    const reserved = await verificationsRepository.reserveDocumentVersion({
      applicationId: application.id,
      documentVersionId: '43dc3de2-8401-49cf-9230-fbdb499356e2',
      type: 'business_pan',
      objectKey: 'verification-documents/org/version-1',
      contentType: 'image/png',
      contentLength: 1000,
      userId: owner.id,
    });
    expect(typeof reserved).not.toBe('string');
    if (typeof reserved === 'string') return;
    await verificationsRepository.commitDocument(reserved.id);
    const submitted = await verificationsRepository.submit({
      applicationId: application.id,
      userId: owner.id,
      expectedStatus: VERIFICATION_APPLICATION_STATUS.DRAFT,
    });
    expect(typeof submitted).not.toBe('string');

    const expiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
    const reviewed = await verificationsRepository.review({
      applicationId: application.id,
      reviewerId: reviewer.id,
      decision: 'approve',
      expiresAt,
    });
    expect(reviewed).toMatchObject({
      status: VERIFICATION_APPLICATION_STATUS.VERIFIED,
      expiresAt,
    });

    const [documentRow] = await db
      .select()
      .from(schema.verificationDocumentVersion)
      .where(eq(schema.verificationDocumentVersion.id, reserved.id));
    const notifications = await db
      .select()
      .from(schema.verificationNotificationOutbox)
      .where(eq(schema.verificationNotificationOutbox.applicationId, application.id));
    const searchEvents = await db
      .select()
      .from(schema.searchProjectionOutbox)
      .where(eq(schema.searchProjectionOutbox.entityId, profile.id));

    expect(documentRow?.status).toBe(VERIFICATION_DOCUMENT_STATUS.VERIFIED);
    expect(notifications).toHaveLength(1);
    expect(searchEvents).toHaveLength(1);
    await expect(
      verificationsRepository.submit({
        applicationId: application.id,
        userId: owner.id,
        expectedStatus: VERIFICATION_APPLICATION_STATUS.VERIFIED,
      }),
    ).resolves.toBe(VERIFICATION_MUTATION_RESULT.STATE_CHANGED);
    await expect(
      verificationsRepository.review({
        applicationId: application.id,
        reviewerId: reviewer.id,
        decision: 'approve',
        expiresAt,
      }),
    ).resolves.toBe(VERIFICATION_MUTATION_RESULT.STATE_CHANGED);
  });

  it('persists rejection notes and supports immutable document replacement on resubmission', async () => {
    const { owner, profile, application } = await setupApplication();
    const reviewer = await makeUser({ role: PLATFORM_ROLE.ADMIN });
    await Promise.all([
      makeProject({ designerId: profile.id, status: 'published' }),
      makeProject({ designerId: profile.id, status: 'published' }),
      makeProject({ designerId: profile.id, status: 'published' }),
    ]);
    const first = await verificationsRepository.reserveDocumentVersion({
      applicationId: application.id,
      documentVersionId: '9d73e205-51e7-4c22-8b1c-aa2a371a0cdc',
      type: 'gst_registration_certificate',
      objectKey: 'verification-documents/org/rejected-version',
      contentType: 'application/pdf',
      contentLength: 1000,
      userId: owner.id,
    });
    expect(typeof first).not.toBe('string');
    if (typeof first === 'string') return;
    await verificationsRepository.commitDocument(first.id);
    await verificationsRepository.submit({
      applicationId: application.id,
      userId: owner.id,
      expectedStatus: VERIFICATION_APPLICATION_STATUS.DRAFT,
    });

    const note = 'The GST number is not readable.';
    await verificationsRepository.review({
      applicationId: application.id,
      reviewerId: reviewer.id,
      decision: 'reject',
      rejection: { note, rejectedDocumentVersionIds: [first.id] },
    });

    const [rejectedDocument] = await db
      .select()
      .from(schema.verificationDocumentVersion)
      .where(eq(schema.verificationDocumentVersion.id, first.id));
    const history = await verificationsRepository.listHistory(application.id);
    const [notification] = await db
      .select()
      .from(schema.verificationNotificationOutbox)
      .where(eq(schema.verificationNotificationOutbox.applicationId, application.id));
    expect(rejectedDocument?.status).toBe(VERIFICATION_DOCUMENT_STATUS.REJECTED);
    expect(history.at(-1)).toMatchObject({
      action: VERIFICATION_REVIEW_ACTION.REJECTED,
      note,
      rejectedDocumentVersionIds: [first.id],
    });
    expect(notification).toMatchObject({
      eventType: VERIFICATION_NOTIFICATION_EVENT.CHANGES_REQUESTED,
      note,
    });

    const replacement = await verificationsRepository.reserveDocumentVersion({
      applicationId: application.id,
      documentVersionId: '5a9fb386-1963-4ed4-b770-b4f6f884cb9a',
      type: 'gst_registration_certificate',
      objectKey: 'verification-documents/org/replacement-version',
      contentType: 'application/pdf',
      contentLength: 1200,
      userId: owner.id,
    });
    expect(typeof replacement).not.toBe('string');
    if (typeof replacement === 'string') return;
    expect(replacement.version).toBe(2);
    await verificationsRepository.commitDocument(replacement.id);
    await expect(
      verificationsRepository.submit({
        applicationId: application.id,
        userId: owner.id,
        expectedStatus: VERIFICATION_APPLICATION_STATUS.REJECTED,
      }),
    ).resolves.toMatchObject({
      status: VERIFICATION_APPLICATION_STATUS.PENDING,
      attempt: 2,
    });
  });
});
