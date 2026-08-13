import { describe, expect, it, vi } from 'vitest';
import { testClient } from 'hono/testing';
import { db, eq, schema } from '@repo/db';
import { makeDesigner, makeOrganization, makeProject } from '@repo/db/testing';
import type * as queueModule from '@repo/queue';
import type * as storageModule from '@repo/storage';
import { ORGANIZATION_MEMBER_ROLE, PLATFORM_ROLE } from '@repo/contracts';
import { app } from '../../../src/app.js';
import { createRoleSession } from '../../helpers/auth.js';

vi.mock('@repo/queue', async (original) => ({
  ...(await original<typeof queueModule>()),
  enqueueSms: vi.fn(async () => undefined),
}));
vi.mock('@repo/storage', async (original) => ({
  ...(await original<typeof storageModule>()),
  objectExists: vi.fn(async () => true),
}));

const client = testClient(app);

async function designerWorkspace() {
  const session = await createRoleSession('+919800000071', 'designer');
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
      phoneNumber: '+919800000071',
      phoneNumberVerified: true,
    })
    .where(eq(schema.user.id, session.userId));
  await db
    .update(schema.session)
    .set({ activeOrganizationId: organization.id })
    .where(eq(schema.session.userId, session.userId));
  return { ...session, organization, profile };
}

describe('verification route authorization', () => {
  it('requires authentication for designer state', async () => {
    const response = await client.api.verifications.$get();
    expect(response.status).toBe(401);
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
});
