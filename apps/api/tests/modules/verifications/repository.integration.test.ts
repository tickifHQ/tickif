import { describe, expect, it } from 'vitest';
import { db, eq, inArray, schema } from '@repo/db';
import { makeDesigner, makeOrganization, makeProject, makeTeam, makeUser } from '@repo/db/testing';
import {
  ADMIN_VERIFICATION_QUEUE_TAB,
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

async function setupApplication(phoneNumber = '+919800000010') {
  const owner = await makeUser({
    name: 'Legal Owner',
    phoneNumber,
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

async function setupBranchApplication() {
  const context = await setupApplication();
  const team = await makeTeam({ organizationId: context.organization.id, name: 'Second branch' });
  const branchProfile = await makeDesigner({
    orgId: context.organization.id,
    teamId: team.id,
    userId: context.owner.id,
  });
  await makeProject({ designerId: context.profile.id, status: 'published' });
  await makeProject({ designerId: branchProfile.id, status: 'published' });
  const thirdProject = await makeProject({ designerId: branchProfile.id, status: 'draft' });
  const unrelatedProfile = await makeDesigner();
  for (let index = 0; index < 3; index++) {
    await makeProject({ designerId: unrelatedProfile.id, status: 'published' });
  }
  const document = await verificationsRepository.reserveDocumentVersion({
    applicationId: context.application.id,
    documentVersionId: '10f682ca-8483-4be9-a20d-a7c808962b88',
    type: 'business_pan',
    objectKey: 'verification-documents/branches/business-pan',
    contentType: 'application/pdf',
    contentLength: 1000,
    userId: context.owner.id,
  });
  if (typeof document === 'string') throw new Error('Document fixture reservation failed');
  await verificationsRepository.commitDocument(document.id, context.organization.id);
  return { ...context, branchProfile, thirdProject };
}

describe('verification repository lifecycle', () => {
  it('submits using published projects across the organization branches, not other organizations or drafts', async () => {
    const { application, organization, owner, thirdProject } = await setupBranchApplication();
    const input = {
      applicationId: application.id,
      userId: owner.id,
      expectedStatus: VERIFICATION_APPLICATION_STATUS.DRAFT,
    };

    await expect(verificationsRepository.submit(input)).resolves.toBe(
      VERIFICATION_MUTATION_RESULT.INVALID_DOCUMENTS,
    );
    await db
      .update(schema.project)
      .set({ status: 'published' })
      .where(eq(schema.project.id, thirdProject.id));

    await expect(
      verificationsRepository.findContextByOrganization(organization.id),
    ).resolves.toMatchObject({
      publishedProjectCount: 3,
    });
    await expect(verificationsRepository.submit(input)).resolves.toMatchObject({
      status: VERIFICATION_APPLICATION_STATUS.PENDING,
    });
  });

  it('rechecks organization-wide published projects inside approval and refreshes every branch', async () => {
    const { application, profile, branchProfile, thirdProject } = await setupBranchApplication();
    const reviewer = await makeUser({ role: PLATFORM_ROLE.ADMIN });
    await db
      .update(schema.verificationApplication)
      .set({
        status: VERIFICATION_APPLICATION_STATUS.PENDING,
        submittedAt: new Date(),
      })
      .where(eq(schema.verificationApplication.id, application.id));
    const input = {
      applicationId: application.id,
      reviewerId: reviewer.id,
      decision: 'approve' as const,
      expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
    };

    await expect(verificationsRepository.review(input)).resolves.toBe(
      VERIFICATION_MUTATION_RESULT.INELIGIBLE,
    );
    await db
      .update(schema.project)
      .set({ status: 'published' })
      .where(eq(schema.project.id, thirdProject.id));
    await expect(verificationsRepository.findAdminDetail(application.id)).resolves.toMatchObject({
      publishedProjectCount: 3,
    });
    await expect(verificationsRepository.review(input)).resolves.toMatchObject({
      status: VERIFICATION_APPLICATION_STATUS.VERIFIED,
    });
    const events = await db
      .select()
      .from(schema.searchProjectionOutbox)
      .where(inArray(schema.searchProjectionOutbox.entityId, [profile.id, branchProfile.id]));
    expect(events.map((event) => event.entityId).sort()).toEqual(
      [profile.id, branchProfile.id].sort(),
    );
  });

  it('refreshes every branch badge when approval is reversed', async () => {
    const { application, profile, branchProfile } = await setupBranchApplication();
    const reviewer = await makeUser({ role: PLATFORM_ROLE.ADMIN });
    const reviewedAt = new Date();
    await db
      .update(schema.verificationApplication)
      .set({
        status: VERIFICATION_APPLICATION_STATUS.VERIFIED,
        submittedAt: reviewedAt,
        reviewedAt,
        reviewedByUserId: reviewer.id,
        approvedAt: reviewedAt,
        expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
      })
      .where(eq(schema.verificationApplication.id, application.id));

    await expect(
      verificationsRepository.revokeApproval({
        applicationId: application.id,
        reviewerId: reviewer.id,
        revocation: { note: 'Recheck the registration details.' },
      }),
    ).resolves.toMatchObject({ status: VERIFICATION_APPLICATION_STATUS.PENDING, attempt: 2 });

    const events = await db
      .select()
      .from(schema.searchProjectionOutbox)
      .where(inArray(schema.searchProjectionOutbox.entityId, [profile.id, branchProfile.id]));
    expect(events.map((event) => event.entityId).sort()).toEqual(
      [profile.id, branchProfile.id].sort(),
    );
  });

  it('keeps an expired approval read-only at the exact expiry boundary', async () => {
    const { application } = await setupApplication();
    const reviewer = await makeUser({ role: PLATFORM_ROLE.ADMIN });
    const expiry = new Date('2026-11-01T09:00:00.000Z');
    await db
      .update(schema.verificationApplication)
      .set({
        status: VERIFICATION_APPLICATION_STATUS.VERIFIED,
        submittedAt: new Date('2026-09-01T08:00:00.000Z'),
        reviewedAt: new Date('2026-09-01T09:00:00.000Z'),
        reviewedByUserId: reviewer.id,
        approvedAt: new Date('2026-09-01T09:00:00.000Z'),
        expiresAt: expiry,
      })
      .where(eq(schema.verificationApplication.id, application.id));

    await expect(
      verificationsRepository.revokeApproval(
        {
          applicationId: application.id,
          reviewerId: reviewer.id,
          revocation: { note: 'This expired approval must remain read-only.' },
        },
        expiry,
      ),
    ).resolves.toBe(VERIFICATION_MUTATION_RESULT.STATE_CHANGED);
    await expect(verificationsRepository.findAdminDetail(application.id)).resolves.toMatchObject({
      application: {
        status: VERIFICATION_APPLICATION_STATUS.VERIFIED,
        attempt: application.attempt,
        expiresAt: expiry,
      },
    });
  });

  it('filters the admin queue into new, re-review, accepted, and changes-requested tabs', async () => {
    const newSubmission = await setupApplication('+919800000011');
    const reReview = await setupApplication('+919800000012');
    const accepted = await setupApplication('+919800000013');
    const changesRequested = await setupApplication('+919800000014');
    const reviewer = await makeUser({ role: PLATFORM_ROLE.ADMIN });
    const submittedAt = new Date('2026-09-01T08:00:00.000Z');
    const reviewedAt = new Date('2026-09-01T09:00:00.000Z');

    await Promise.all([
      db
        .update(schema.verificationApplication)
        .set({ status: 'pending', submittedAt })
        .where(eq(schema.verificationApplication.id, newSubmission.application.id)),
      db
        .update(schema.verificationApplication)
        .set({ status: 'pending', attempt: 2, submittedAt })
        .where(eq(schema.verificationApplication.id, reReview.application.id)),
      db
        .update(schema.verificationApplication)
        .set({
          status: 'verified',
          submittedAt,
          reviewedAt,
          approvedAt: reviewedAt,
          expiresAt: new Date('2026-11-01T09:00:00.000Z'),
          reviewedByUserId: reviewer.id,
        })
        .where(eq(schema.verificationApplication.id, accepted.application.id)),
      db
        .update(schema.verificationApplication)
        .set({
          status: 'rejected',
          submittedAt,
          reviewedAt,
          reviewedByUserId: reviewer.id,
        })
        .where(eq(schema.verificationApplication.id, changesRequested.application.id)),
    ]);

    const tabs = await Promise.all(
      Object.values(ADMIN_VERIFICATION_QUEUE_TAB).map((tab) =>
        verificationsRepository.listAdminQueue({ tab, page: 1, limit: 20 }, reviewedAt),
      ),
    );

    expect(tabs.map(({ total }) => total)).toEqual([1, 1, 1, 1, 0]);
    expect(tabs.map(({ items }) => items[0]?.id)).toEqual([
      newSubmission.application.id,
      reReview.application.id,
      accepted.application.id,
      changesRequested.application.id,
      undefined,
    ]);
    expect(tabs.map(({ items }) => items[0]?.status)).toEqual([
      'pending',
      'pending',
      'verified',
      'rejected',
      undefined,
    ]);
  });

  it('moves approvals from accepted to expired at the exact expiry boundary', async () => {
    const { application } = await setupApplication();
    const expiry = new Date('2026-11-01T09:00:00.000Z');
    await db
      .update(schema.verificationApplication)
      .set({
        status: 'verified',
        submittedAt: new Date('2026-09-01T08:00:00.000Z'),
        reviewedAt: new Date('2026-09-01T09:00:00.000Z'),
        approvedAt: new Date('2026-09-01T09:00:00.000Z'),
        expiresAt: expiry,
      })
      .where(eq(schema.verificationApplication.id, application.id));
    for (const [offset, acceptedTotal, expiredTotal] of [
      [-1, 1, 0],
      [0, 0, 1],
      [1, 0, 1],
    ] as const) {
      const now = new Date(expiry.getTime() + offset);
      const accepted = await verificationsRepository.listAdminQueue(
        { tab: 'accepted', page: 1, limit: 20 },
        now,
      );
      const expired = await verificationsRepository.listAdminQueue(
        { tab: 'expired', page: 1, limit: 20 },
        now,
      );
      expect(accepted.total).toBe(acceptedTotal);
      expect(accepted.items).toHaveLength(acceptedTotal);
      expect(expired.total).toBe(expiredTotal);
      expect(expired.items).toHaveLength(expiredTotal);
      if (expiredTotal)
        expect(expired.items[0]).toMatchObject({ id: application.id, expiresAt: expiry });
    }
  });

  it('keeps queue totals aligned with applications that can be rendered', async () => {
    const visible = await setupApplication('+919800000015');
    const branch = await makeTeam({
      organizationId: visible.organization.id,
      name: 'Second branch',
    });
    await makeDesigner({ orgId: visible.organization.id, teamId: branch.id });
    const ownerWithoutProfile = await makeUser({
      name: 'Owner Without Profile',
      phoneNumber: '+919800000016',
      phoneNumberVerified: true,
    });
    const organizationWithoutProfile = await makeOrganization();
    await db.insert(schema.member).values({
      id: `member-${ownerWithoutProfile.id}`,
      organizationId: organizationWithoutProfile.id,
      userId: ownerWithoutProfile.id,
      role: ORGANIZATION_MEMBER_ROLE.OWNER,
      createdAt: new Date(),
    });
    const applicationWithoutProfile = await verificationsRepository.getOrCreateForOrganization(
      organizationWithoutProfile.id,
    );

    await Promise.all([
      db
        .update(schema.verificationApplication)
        .set({ status: 'pending', submittedAt: new Date('2026-09-01T08:00:00.000Z') })
        .where(eq(schema.verificationApplication.id, visible.application.id)),
      db
        .update(schema.verificationApplication)
        .set({ status: 'pending', submittedAt: new Date('2026-09-01T09:00:00.000Z') })
        .where(eq(schema.verificationApplication.id, applicationWithoutProfile.id)),
    ]);

    const result = await verificationsRepository.listAdminQueue({
      tab: ADMIN_VERIFICATION_QUEUE_TAB.NEW,
      page: 1,
      limit: 20,
    });

    expect(result.total).toBe(1);
    expect(result.items.map((item) => item.id)).toEqual([visible.application.id]);
  });

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
    const { owner, organization, profile, application } = await setupApplication();
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
    await verificationsRepository.commitDocument(reserved.id, organization.id);
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
    const { owner, organization, profile, application } = await setupApplication();
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
    await verificationsRepository.commitDocument(first.id, organization.id);
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
    await verificationsRepository.commitDocument(replacement.id, organization.id);
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

  it('requires every rejected current document to be replaced before resubmission', async () => {
    const { owner, organization, profile, application } = await setupApplication();
    const reviewer = await makeUser({ role: PLATFORM_ROLE.ADMIN });
    await Promise.all([
      makeProject({ designerId: profile.id, status: 'published' }),
      makeProject({ designerId: profile.id, status: 'published' }),
      makeProject({ designerId: profile.id, status: 'published' }),
    ]);
    const businessDocument = await verificationsRepository.reserveDocumentVersion({
      applicationId: application.id,
      documentVersionId: '6a29d745-f375-49ab-b21d-61bc7551c764',
      type: 'gst_registration_certificate',
      objectKey: 'verification-documents/org/business-version',
      contentType: 'application/pdf',
      contentLength: 1000,
      userId: owner.id,
    });
    const personalDocument = await verificationsRepository.reserveDocumentVersion({
      applicationId: application.id,
      documentVersionId: '32631776-953f-4388-a635-c74b9e8959ab',
      type: 'personal_pan',
      objectKey: 'verification-documents/org/personal-version',
      contentType: 'application/pdf',
      contentLength: 1000,
      userId: owner.id,
    });
    expect(typeof businessDocument).not.toBe('string');
    expect(typeof personalDocument).not.toBe('string');
    if (typeof businessDocument === 'string' || typeof personalDocument === 'string') return;
    await verificationsRepository.commitDocument(businessDocument.id, organization.id);
    await verificationsRepository.commitDocument(personalDocument.id, organization.id);
    await verificationsRepository.submit({
      applicationId: application.id,
      userId: owner.id,
      expectedStatus: VERIFICATION_APPLICATION_STATUS.DRAFT,
    });
    await verificationsRepository.review({
      applicationId: application.id,
      reviewerId: reviewer.id,
      decision: 'reject',
      rejection: {
        note: 'Upload a clearer PAN card.',
        rejectedDocumentVersionIds: [personalDocument.id],
      },
    });

    await expect(
      verificationsRepository.submit({
        applicationId: application.id,
        userId: owner.id,
        expectedStatus: VERIFICATION_APPLICATION_STATUS.REJECTED,
      }),
    ).resolves.toBe(VERIFICATION_MUTATION_RESULT.INVALID_DOCUMENTS);

    const replacement = await verificationsRepository.reserveDocumentVersion({
      applicationId: application.id,
      documentVersionId: '6128912e-c2f9-4245-b89b-a43f9acfdd74',
      type: 'personal_pan',
      objectKey: 'verification-documents/org/personal-replacement',
      contentType: 'application/pdf',
      contentLength: 1200,
      userId: owner.id,
    });
    expect(typeof replacement).not.toBe('string');
    if (typeof replacement === 'string') return;
    await verificationsRepository.commitDocument(replacement.id, organization.id);

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

  it('does not approve an application after its eligibility becomes stale', async () => {
    const { owner, organization, profile, application } = await setupApplication();
    const reviewer = await makeUser({ role: PLATFORM_ROLE.ADMIN });
    await Promise.all([
      makeProject({ designerId: profile.id, status: 'published' }),
      makeProject({ designerId: profile.id, status: 'published' }),
      makeProject({ designerId: profile.id, status: 'published' }),
    ]);
    const document = await verificationsRepository.reserveDocumentVersion({
      applicationId: application.id,
      documentVersionId: 'f02f365d-a3a6-41d2-a87d-b1f016bbfdf7',
      type: 'gst_registration_certificate',
      objectKey: 'verification-documents/org/stale-eligibility',
      contentType: 'application/pdf',
      contentLength: 1000,
      userId: owner.id,
    });
    expect(typeof document).not.toBe('string');
    if (typeof document === 'string') return;
    await verificationsRepository.commitDocument(document.id, organization.id);
    await verificationsRepository.submit({
      applicationId: application.id,
      userId: owner.id,
      expectedStatus: VERIFICATION_APPLICATION_STATUS.DRAFT,
    });
    await db
      .update(schema.user)
      .set({ phoneNumberVerified: false })
      .where(eq(schema.user.id, owner.id));

    await expect(
      verificationsRepository.review({
        applicationId: application.id,
        reviewerId: reviewer.id,
        decision: 'approve',
        expiresAt: new Date('2026-11-01T00:00:00.000Z'),
      }),
    ).resolves.toBe('ineligible');
    const [storedApplication] = await db
      .select()
      .from(schema.verificationApplication)
      .where(eq(schema.verificationApplication.id, application.id));
    expect(storedApplication?.status).toBe(VERIFICATION_APPLICATION_STATUS.PENDING);
  });

  it('does not approve after the published project count drops below the requirement', async () => {
    const { owner, organization, profile, application } = await setupApplication();
    const reviewer = await makeUser({ role: PLATFORM_ROLE.ADMIN });
    const projects = await Promise.all([
      makeProject({ designerId: profile.id, status: 'published' }),
      makeProject({ designerId: profile.id, status: 'published' }),
      makeProject({ designerId: profile.id, status: 'published' }),
    ]);
    const document = await verificationsRepository.reserveDocumentVersion({
      applicationId: application.id,
      documentVersionId: '818730f0-c9fb-43c3-958d-5a139dff3986',
      type: 'gst_registration_certificate',
      objectKey: 'verification-documents/org/stale-project-count',
      contentType: 'application/pdf',
      contentLength: 1000,
      userId: owner.id,
    });
    expect(typeof document).not.toBe('string');
    if (typeof document === 'string') return;
    await verificationsRepository.commitDocument(document.id, organization.id);
    await verificationsRepository.submit({
      applicationId: application.id,
      userId: owner.id,
      expectedStatus: VERIFICATION_APPLICATION_STATUS.DRAFT,
    });
    await db
      .update(schema.project)
      .set({ status: 'draft' })
      .where(eq(schema.project.id, projects[0]!.id));

    await expect(
      verificationsRepository.review({
        applicationId: application.id,
        reviewerId: reviewer.id,
        decision: 'approve',
        expiresAt: new Date('2026-11-01T00:00:00.000Z'),
      }),
    ).resolves.toBe(VERIFICATION_MUTATION_RESULT.INELIGIBLE);
  });
});
