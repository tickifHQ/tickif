import { describe, expect, it } from 'vitest';
import { db, eq, schema } from '@repo/db';
import { makeDesigner, makeProject } from '@repo/db/testing';
import { projectsRepository } from '../../../src/modules/projects/repository.js';
import { withPublicStudioLogos } from '../../../src/modules/projects/public-studio-logos.js';

describe('public card verification', () => {
  it('badges only published active studios with current approved verification, including logo-free studios', async () => {
    const studio = await makeDesigner({ status: 'active', logoImageId: null });
    const published = await makeProject({ designerId: studio.id, status: 'published' });
    const draft = await makeProject({ designerId: studio.id, status: 'draft' });
    const now = new Date();
    await db.insert(schema.verificationApplication).values({
      organizationId: studio.orgId,
      status: 'verified',
      submittedAt: now,
      reviewedAt: now,
      approvedAt: now,
      expiresAt: new Date(now.getTime() + 86400000),
    });
    expect(await projectsRepository.findPublicStudioVerification([published.id, draft.id])).toEqual(
      new Map([[published.id, true]]),
    );
    expect((await withPublicStudioLogos([{ id: published.id }]))[0]).toMatchObject({
      studioIsVerified: true,
      studioLogoUrl: null,
    });
    await db
      .update(schema.verificationApplication)
      .set({ expiresAt: new Date(now.getTime() - 1000) })
      .where(eq(schema.verificationApplication.organizationId, studio.orgId));
    expect((await withPublicStudioLogos([{ id: published.id }]))[0]?.studioIsVerified).toBe(false);
    await db
      .update(schema.verificationApplication)
      .set({ status: 'rejected', approvedAt: null, expiresAt: null })
      .where(eq(schema.verificationApplication.organizationId, studio.orgId));
    expect((await withPublicStudioLogos([{ id: published.id }]))[0]?.studioIsVerified).toBe(false);
    await db
      .update(schema.verificationApplication)
      .set({ status: 'pending', reviewedAt: null })
      .where(eq(schema.verificationApplication.organizationId, studio.orgId));
    expect((await withPublicStudioLogos([{ id: published.id }]))[0]?.studioIsVerified).toBe(false);
    await db
      .update(schema.verificationApplication)
      .set({
        status: 'verified',
        reviewedAt: now,
        approvedAt: now,
        expiresAt: new Date(now.getTime() + 86400000),
      })
      .where(eq(schema.verificationApplication.organizationId, studio.orgId));
    await db
      .update(schema.designerProfile)
      .set({ status: 'suspended' })
      .where(eq(schema.designerProfile.id, studio.id));
    expect((await withPublicStudioLogos([{ id: published.id }]))[0]?.studioIsVerified).toBe(false);
  });
});
