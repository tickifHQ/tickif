import { describe, expect, it, vi } from 'vitest';
import { testClient } from 'hono/testing';
import { db, eq, schema } from '@repo/db';
import { makeDesigner, makeOrganization, makeProject } from '@repo/db/testing';
import type * as queueModule from '@repo/queue';
import type * as storageModule from '@repo/storage';
import { ORGANIZATION_MEMBER_ROLE, PLATFORM_ROLE } from '@repo/contracts';
import { app } from '../../../src/app.js';
import { createRoleSession } from '../../helpers/auth.js';
import { profilesRepository } from '../../../src/modules/profiles/repository.js';

vi.mock('@repo/queue', async (original) => ({
  ...(await original<typeof queueModule>()),
  enqueueSms: vi.fn(async () => undefined),
}));
vi.mock('@repo/storage', async (original) => ({
  ...(await original<typeof storageModule>()),
  deleteObject: vi.fn(async () => undefined),
  objectExists: vi.fn(async () => true),
}));

const client = testClient(app);

async function designerWorkspace(phoneNumber = '+919800000071') {
  const session = await createRoleSession(phoneNumber, 'designer');
  const organization = await makeOrganization();
  await db.insert(schema.member).values({
    id: `member-${session.userId}`,
    organizationId: organization.id,
    userId: session.userId,
    role: ORGANIZATION_MEMBER_ROLE.OWNER,
    createdAt: new Date(),
  });
  const profile = await makeDesigner({
    userId: session.userId,
    orgId: organization.id,
    displayName: 'Studio One',
  });
  await db
    .update(schema.user)
    .set({
      name: 'Legal Owner',
      phoneNumber,
      phoneNumberVerified: true,
    })
    .where(eq(schema.user.id, session.userId));
  await db
    .update(schema.session)
    .set({ activeOrganizationId: organization.id })
    .where(eq(schema.session.userId, session.userId));
  return { ...session, organization, profile };
}

async function submitEligibleVerification(phoneNumber: string) {
  const workspace = await designerWorkspace(phoneNumber);
  await Promise.all([
    makeProject({ designerId: workspace.profile.id, status: 'published' }),
    makeProject({ designerId: workspace.profile.id, status: 'published' }),
    makeProject({ designerId: workspace.profile.id, status: 'published' }),
  ]);
  const headers = { cookie: workspace.cookie };
  const uploadResponse = await client.api.verifications.documents['upload-url'].$post(
    {
      json: {
        type: 'gst_registration_certificate',
        contentType: 'application/pdf',
        size: 1000,
      },
    },
    { headers },
  );
  if (uploadResponse.status !== 201) throw new Error('expected verification upload reservation');
  const upload = await uploadResponse.json();
  const commitResponse = await client.api.verifications.documents[':versionId'].commit.$post(
    { param: { versionId: upload.documentVersionId } },
    { headers },
  );
  if (commitResponse.status !== 200) throw new Error('expected verification upload commit');
  const submitResponse = await client.api.verifications.submit.$post({}, { headers });
  if (submitResponse.status !== 200) throw new Error('expected verification submission');
  const submitted = await submitResponse.json();
  return {
    ...workspace,
    applicationId: submitted.applicationId,
    documentVersionId: upload.documentVersionId,
  };
}

describe('verification route authorization', () => {
  it('requires authentication for designer state', async () => {
    const response = await client.api.verifications.$get();
    expect(response.status).toBe(401);
  });

  it('requires authentication to remove a document', async () => {
    const response = await client.api.verifications.documents[':versionId'].$delete({
      param: { versionId: '11111111-1111-4111-8111-111111111111' },
    });
    expect(response.status).toBe(401);
  });

  it('does not let another organization remove a private document', async () => {
    const owner = await designerWorkspace('+919800000073');
    const otherDesigner = await designerWorkspace('+919800000074');
    const uploadResponse = await client.api.verifications.documents['upload-url'].$post(
      {
        json: {
          type: 'gst_registration_certificate',
          contentType: 'application/pdf',
          size: 1000,
        },
      },
      { headers: { cookie: owner.cookie } },
    );
    expect(uploadResponse.status).toBe(201);
    if (uploadResponse.status !== 201) throw new Error('expected 201');
    const upload = await uploadResponse.json();

    const response = await client.api.verifications.documents[':versionId'].$delete(
      { param: { versionId: upload.documentVersionId } },
      { headers: { cookie: otherDesigner.cookie } },
    );

    expect(response.status).toBe(404);
    const [stored] = await db
      .select()
      .from(schema.verificationDocumentVersion)
      .where(eq(schema.verificationDocumentVersion.id, upload.documentVersionId));
    expect(stored?.status).toBe('pending_upload');
  });

  it('returns server-derived state only for the active designer organization', async () => {
    const { cookie, organization } = await designerWorkspace();
    const response = await client.api.verifications.$get({}, { headers: { cookie } });

    expect(response.status).toBe(200);
    if (response.status !== 200) throw new Error('expected 200');
    const body = await response.json();
    const [stored] = await db
      .select()
      .from(schema.verificationApplication)
      .where(eq(schema.verificationApplication.organizationId, organization.id));
    expect(body.applicationId).toBe(stored?.id);
    expect(body.status).toBe('draft');
    expect(body.identity).toMatchObject({
      ownerName: 'Legal Owner',
      ownerPhone: '+919800000071',
      canEdit: true,
    });
    expect(body.permissions).toEqual({ canManage: true });
  });

  it('rejects a designer from the admin queue', async () => {
    const { cookie } = await designerWorkspace();
    const response = await client.api.admin.verifications.$get(
      { query: {} },
      { headers: { cookie } },
    );
    expect(response.status).toBe(403);
  });

  it('allows an admin to read the moderation queue without an active organization', async () => {
    const { cookie } = await createRoleSession('+919800000072', PLATFORM_ROLE.ADMIN);
    const response = await client.api.admin.verifications.$get(
      { query: {} },
      { headers: { cookie } },
    );
    expect(response.status).toBe(200);
  });

  it('surfaces a designer submission to admin review and persists requested changes', async () => {
    const submission = await submitEligibleVerification('+919800000075');
    const admin = await createRoleSession('+919800000076', PLATFORM_ROLE.ADMIN);
    const headers = { cookie: admin.cookie };

    const queueResponse = await client.api.admin.verifications.$get(
      { query: { page: '1', limit: '20' } },
      { headers },
    );
    expect(queueResponse.status).toBe(200);
    if (queueResponse.status !== 200) throw new Error('expected admin verification queue');
    await expect(queueResponse.json()).resolves.toMatchObject({
      total: 1,
      items: [
        {
          id: submission.applicationId,
          organizationId: submission.organization.id,
          documentCount: 1,
        },
      ],
    });

    const detailResponse = await client.api.admin.verifications[':id'].$get(
      { param: { id: submission.applicationId } },
      { headers },
    );
    expect(detailResponse.status).toBe(200);
    if (detailResponse.status !== 200) throw new Error('expected admin verification detail');
    const detail = await detailResponse.json();
    expect(detail.eligibility).toEqual({
      phoneVerified: { met: true, label: 'Verify the account owner phone number' },
      publishedProjects: {
        met: true,
        label: 'Publish at least 3 projects',
        current: 3,
        required: 3,
      },
    });
    expect(detail.documents).toEqual([
      expect.objectContaining({ id: submission.documentVersionId, status: 'uploaded' }),
    ]);
    expect(detail.documents[0]).not.toHaveProperty('objectKey');

    const rejectResponse = await client.api.admin.verifications[':id'].reject.$post(
      {
        param: { id: submission.applicationId },
        json: {
          note: 'Upload a clearer registration certificate.',
          rejectedDocumentVersionIds: [submission.documentVersionId],
        },
      },
      { headers },
    );
    expect(rejectResponse.status).toBe(200);
    if (rejectResponse.status !== 200) throw new Error('expected requested changes response');
    const rejected = await rejectResponse.json();
    expect(rejected).toMatchObject({
      application: { status: 'rejected' },
      documents: [{ id: submission.documentVersionId, status: 'rejected' }],
    });
    expect(rejected.history).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'rejected',
          note: 'Upload a clearer registration certificate.',
        }),
      ]),
    );

    const designerStateResponse = await client.api.verifications.$get(
      {},
      { headers: { cookie: submission.cookie } },
    );
    expect(designerStateResponse.status).toBe(200);
    if (designerStateResponse.status !== 200)
      throw new Error('expected designer verification state');
    await expect(designerStateResponse.json()).resolves.toMatchObject({
      status: 'rejected',
      latestNote: 'Upload a clearer registration certificate.',
      history: expect.arrayContaining([
        expect.objectContaining({
          actorLabel: 'Tickif Review Team',
          note: 'Upload a clearer registration certificate.',
        }),
      ]),
    });
  });

  it('allows an admin to approve a submitted designer verification', async () => {
    const submission = await submitEligibleVerification('+919800000077');
    const admin = await createRoleSession('+919800000078', PLATFORM_ROLE.ADMIN);

    expect(await profilesRepository.isOrganizationKycVerified(submission.organization.id)).toBe(
      false,
    );

    const response = await client.api.admin.verifications[':id'].approve.$post(
      { param: { id: submission.applicationId } },
      { headers: { cookie: admin.cookie } },
    );

    expect(response.status).toBe(200);
    if (response.status !== 200) throw new Error('expected verification approval');
    await expect(response.json()).resolves.toMatchObject({
      application: {
        status: 'verified',
        reviewedAt: expect.any(String),
        approvedAt: expect.any(String),
        expiresAt: expect.any(String),
      },
      documents: [{ id: submission.documentVersionId, status: 'verified' }],
    });
    expect(await profilesRepository.isOrganizationKycVerified(submission.organization.id)).toBe(
      true,
    );
  });

  it('validates upload metadata before reserving a document', async () => {
    const { cookie } = await designerWorkspace();
    const response = await client.api.verifications.documents['upload-url'].$post(
      {
        json: {
          type: 'gst_registration_certificate',
          contentType: 'image/gif',
          size: 1000,
        } as never,
      },
      { headers: { cookie } },
    );

    expect(response.status).toBe(422);
  });

  it('persists the authenticated upload, commit, and submission flow', async () => {
    const { cookie, profile } = await designerWorkspace();
    await Promise.all([
      makeProject({ designerId: profile.id, status: 'published' }),
      makeProject({ designerId: profile.id, status: 'published' }),
      makeProject({ designerId: profile.id, status: 'published' }),
    ]);
    const headers = { cookie };
    const uploadResponse = await client.api.verifications.documents['upload-url'].$post(
      {
        json: {
          type: 'gst_registration_certificate',
          contentType: 'application/pdf',
          size: 1000,
        },
      },
      { headers },
    );
    expect(uploadResponse.status).toBe(201);
    if (uploadResponse.status !== 201) throw new Error('expected 201');
    const upload = await uploadResponse.json();
    expect(upload).not.toHaveProperty('key');

    const commitResponse = await client.api.verifications.documents[':versionId'].commit.$post(
      { param: { versionId: upload.documentVersionId } },
      { headers },
    );
    expect(commitResponse.status).toBe(200);

    const submitResponse = await client.api.verifications.submit.$post({}, { headers });
    expect(submitResponse.status).toBe(200);
    if (submitResponse.status !== 200) throw new Error('expected 200');
    await expect(submitResponse.json()).resolves.toMatchObject({
      status: 'pending',
      eligibility: { eligible: true },
    });
  });

  it('requires a replacement document before resubmitting a rejected application', async () => {
    const { cookie, organization, profile } = await designerWorkspace();
    await Promise.all([
      makeProject({ designerId: profile.id, status: 'published' }),
      makeProject({ designerId: profile.id, status: 'published' }),
      makeProject({ designerId: profile.id, status: 'published' }),
    ]);
    const headers = { cookie };
    const firstUploadResponse = await client.api.verifications.documents['upload-url'].$post(
      {
        json: {
          type: 'gst_registration_certificate',
          contentType: 'application/pdf',
          size: 1000,
        },
      },
      { headers },
    );
    expect(firstUploadResponse.status).toBe(201);
    if (firstUploadResponse.status !== 201) throw new Error('expected 201');
    const firstUpload = await firstUploadResponse.json();
    const firstCommitResponse = await client.api.verifications.documents[':versionId'].commit.$post(
      { param: { versionId: firstUpload.documentVersionId } },
      { headers },
    );
    expect(firstCommitResponse.status).toBe(200);

    const reviewedAt = new Date('2026-08-23T12:00:00.000Z');
    await db
      .update(schema.verificationDocumentVersion)
      .set({ status: 'rejected', reviewedAt })
      .where(eq(schema.verificationDocumentVersion.id, firstUpload.documentVersionId));
    await db
      .update(schema.verificationApplication)
      .set({
        status: 'rejected',
        submittedAt: new Date('2026-08-22T12:00:00.000Z'),
        reviewedAt,
      })
      .where(eq(schema.verificationApplication.organizationId, organization.id));

    const blockedResponse = await client.api.verifications.submit.$post({}, { headers });
    expect(blockedResponse.status).toBe(422);

    const replacementUploadResponse = await client.api.verifications.documents['upload-url'].$post(
      {
        json: {
          type: 'gst_registration_certificate',
          contentType: 'application/pdf',
          size: 2000,
        },
      },
      { headers },
    );
    expect(replacementUploadResponse.status).toBe(201);
    if (replacementUploadResponse.status !== 201) throw new Error('expected 201');
    const replacementUpload = await replacementUploadResponse.json();
    const replacementCommitResponse = await client.api.verifications.documents[
      ':versionId'
    ].commit.$post({ param: { versionId: replacementUpload.documentVersionId } }, { headers });
    expect(replacementCommitResponse.status).toBe(200);
    if (replacementCommitResponse.status !== 200) throw new Error('expected 200');
    await expect(replacementCommitResponse.json()).resolves.toMatchObject({
      status: 'rejected',
      eligibility: {
        eligible: true,
        businessDocumentPresent: { met: true },
      },
      documents: [
        {
          id: replacementUpload.documentVersionId,
          status: 'uploaded',
          version: 2,
        },
      ],
    });

    const resubmitResponse = await client.api.verifications.submit.$post({}, { headers });
    expect(resubmitResponse.status).toBe(200);
    if (resubmitResponse.status !== 200) throw new Error('expected 200');
    await expect(resubmitResponse.json()).resolves.toMatchObject({
      status: 'pending',
      attempt: 2,
      latestNote: null,
    });
  });

  it('cancels an uncommitted upload reservation', async () => {
    const { cookie } = await designerWorkspace();
    const headers = { cookie };
    const uploadResponse = await client.api.verifications.documents['upload-url'].$post(
      {
        json: {
          type: 'gst_registration_certificate',
          contentType: 'application/pdf',
          size: 1000,
        },
      },
      { headers },
    );
    expect(uploadResponse.status).toBe(201);
    if (uploadResponse.status !== 201) throw new Error('expected 201');
    const upload = await uploadResponse.json();

    const response = await client.api.verifications.documents[':versionId'].$delete(
      { param: { versionId: upload.documentVersionId } },
      { headers },
    );

    expect(response.status).toBe(200);
    const [stored] = await db
      .select()
      .from(schema.verificationDocumentVersion)
      .where(eq(schema.verificationDocumentVersion.id, upload.documentVersionId));
    expect(stored).toBeUndefined();
  });

  it('removes a committed document without deleting its audit record', async () => {
    const { cookie } = await designerWorkspace();
    const headers = { cookie };
    const uploadResponse = await client.api.verifications.documents['upload-url'].$post(
      {
        json: {
          type: 'gst_registration_certificate',
          contentType: 'application/pdf',
          size: 1000,
        },
      },
      { headers },
    );
    expect(uploadResponse.status).toBe(201);
    if (uploadResponse.status !== 201) throw new Error('expected 201');
    const upload = await uploadResponse.json();
    const commitResponse = await client.api.verifications.documents[':versionId'].commit.$post(
      { param: { versionId: upload.documentVersionId } },
      { headers },
    );
    expect(commitResponse.status).toBe(200);

    const response = await client.api.verifications.documents[':versionId'].$delete(
      { param: { versionId: upload.documentVersionId } },
      { headers },
    );

    expect(response.status).toBe(200);
    if (response.status !== 200) throw new Error('expected 200');
    await expect(response.json()).resolves.toMatchObject({
      documents: [],
      eligibility: { businessDocumentPresent: { met: false } },
    });
    const [stored] = await db
      .select()
      .from(schema.verificationDocumentVersion)
      .where(eq(schema.verificationDocumentVersion.id, upload.documentVersionId));
    expect(stored).toMatchObject({
      status: 'removed',
      removedByUserId: expect.any(String),
      removedAt: expect.any(Date),
    });
  });

  it('does not remove documents while the application is under review', async () => {
    const { cookie, organization } = await designerWorkspace();
    const headers = { cookie };
    const uploadResponse = await client.api.verifications.documents['upload-url'].$post(
      {
        json: {
          type: 'gst_registration_certificate',
          contentType: 'application/pdf',
          size: 1000,
        },
      },
      { headers },
    );
    expect(uploadResponse.status).toBe(201);
    if (uploadResponse.status !== 201) throw new Error('expected 201');
    const upload = await uploadResponse.json();
    const commitResponse = await client.api.verifications.documents[':versionId'].commit.$post(
      { param: { versionId: upload.documentVersionId } },
      { headers },
    );
    expect(commitResponse.status).toBe(200);
    await db
      .update(schema.verificationApplication)
      .set({ status: 'pending', submittedAt: new Date() })
      .where(eq(schema.verificationApplication.organizationId, organization.id));

    const response = await client.api.verifications.documents[':versionId'].$delete(
      { param: { versionId: upload.documentVersionId } },
      { headers },
    );

    expect(response.status).toBe(409);
    const [stored] = await db
      .select()
      .from(schema.verificationDocumentVersion)
      .where(eq(schema.verificationDocumentVersion.id, upload.documentVersionId));
    expect(stored).toMatchObject({ status: 'uploaded', removedAt: null });
  });
});
