import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type {
  AdminModerationDetailResponse,
  AdminModerationQueueResponse,
  ErrorResponse,
} from '@repo/contracts';
import { db, schema } from '@repo/db';
import { makeDesigner, makeProject, makeProjectImage, makeProjectRoom } from '@repo/db/testing';
import { app } from '../../../src/app.js';
import { adminProjectsRepository } from '../../../src/modules/admin-projects/repository.js';
import { createRoleSession } from '../../helpers/auth.js';

async function roleSession(phoneNumber: string, role: 'designer' | 'admin' | 'superadmin') {
  return createRoleSession(phoneNumber, role);
}

async function makeCompleteProject(overrides: Partial<typeof schema.project.$inferInsert> = {}) {
  const designer = await makeDesigner();
  const project = await makeProject({
    designerId: designer.id,
    status: 'submitted',
    submittedAt: new Date(),
    citySlug: 'mumbai',
    propertyTypeSlug: 'residential',
    scopeSlug: 'full-home',
    budgetBandSlug: 'premium',
    ...overrides,
  });
  const room = await makeProjectRoom({ projectId: project.id });
  const images: (typeof schema.projectImage.$inferSelect)[] = [];
  for (let index = 0; index < 3; index += 1) {
    images.push(
      await makeProjectImage({
        projectId: project.id,
        roomId: room.id,
        originalKey: `originals/admin-review-${project.id}-${index}.jpg`,
        status: 'ready',
        themeSlugs: ['modern'],
        finishSlugs: ['veneer'],
        phash: index < 2 ? '0000000000000000' : 'ffffffffffffffff',
        duplicateOfImageId: index === 1 ? images[0]!.id : null,
        duplicateDistance: index === 1 ? 0 : null,
      }),
    );
  }
  return { designer, project, room, images };
}

describe('admin project moderation API', () => {
  it('requires admin RBAC for the moderation queue', async () => {
    const unauthenticated = await app.request('/api/admin/projects');
    expect(unauthenticated.status).toBe(401);

    const designer = await roleSession('+919800002101', 'designer');
    const forbidden = await app.request('/api/admin/projects', {
      headers: { cookie: designer.cookie },
    });
    expect(forbidden.status).toBe(403);

    const superadmin = await roleSession('+919800002102', 'superadmin');
    const allowed = await app.request('/api/admin/projects', {
      headers: { cookie: superadmin.cookie },
    });
    expect(allowed.status).toBe(200);
  });

  it('returns a stable FIFO queue with pagination and completeness snapshots', async () => {
    const admin = await roleSession('+919800002103', 'admin');
    const older = await makeCompleteProject({
      title: 'Older submission',
      submittedAt: new Date('2026-07-20T10:00:00.000Z'),
    });
    await makeCompleteProject({
      title: 'Newer submission',
      submittedAt: new Date('2026-07-21T10:00:00.000Z'),
    });
    const otherAdmin = await roleSession('+919800002108', 'admin');
    await makeCompleteProject({
      title: 'Already in review',
      status: 'in_review',
      submittedAt: new Date('2026-07-19T10:00:00.000Z'),
      reviewedBy: otherAdmin.userId,
    });
    const mine = await makeCompleteProject({
      title: 'My active review',
      status: 'in_review',
      submittedAt: new Date('2026-07-18T10:00:00.000Z'),
      reviewedBy: admin.userId,
    });

    const response = await app.request(
      '/api/admin/projects?status=submitted&sort=oldest&page=1&limit=1',
      { headers: { cookie: admin.cookie } },
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as AdminModerationQueueResponse;
    expect(body).toMatchObject({ page: 1, limit: 1, total: 2, totalPages: 2 });
    expect(body.items[0]).toMatchObject({
      id: older.project.id,
      title: 'Older submission',
      imageCount: 3,
      completeness: { complete: true, score: 100, missing: [] },
    });

    const inReview = await app.request('/api/admin/projects?status=in_review', {
      headers: { cookie: admin.cookie },
    });
    expect(inReview.status).toBe(200);
    expect((await inReview.json()) as AdminModerationQueueResponse).toMatchObject({
      total: 1,
      items: [{ id: mine.project.id, reviewedBy: admin.userId }],
    });
  });

  it('lists published projects in the admin queue for reopening and unpublish flows', async () => {
    const admin = await roleSession('+919800002117', 'admin');
    const published = await makeCompleteProject({
      title: 'Published project',
      status: 'published',
      submittedAt: new Date('2026-07-17T10:00:00.000Z'),
      publishedAt: new Date('2026-07-18T10:00:00.000Z'),
      reviewedBy: admin.userId,
    });
    await db
      .update(schema.designerProfile)
      .set({ projectCount: 1 })
      .where(eq(schema.designerProfile.id, published.designer.id));

    const response = await app.request('/api/admin/projects?status=published', {
      headers: { cookie: admin.cookie },
    });

    expect(response.status).toBe(200);
    expect((await response.json()) as AdminModerationQueueResponse).toMatchObject({
      total: 1,
      items: [
        {
          id: published.project.id,
          title: 'Published project',
          status: 'published',
          reviewedBy: admin.userId,
        },
      ],
    });
  });

  it('returns review detail with admin-only originals and pHash duplicate flags', async () => {
    const admin = await roleSession('+919800002104', 'admin');
    const { project } = await makeCompleteProject();

    const response = await app.request(`/api/admin/projects/${project.id}`, {
      headers: { cookie: admin.cookie },
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as AdminModerationDetailResponse;
    expect(body.images).toHaveLength(3);
    expect(body.images[0]?.originalUrl).toContain('X-Amz-Signature=');
    expect(body.images[1]?.duplicate).toEqual({
      imageId: body.images[0]?.id,
      distance: 0,
    });
    expect(body.images[0]?.duplicate).toBeNull();
    expect(body.completeness).toMatchObject({ complete: true, score: 100 });
  });

  it('claims and publishes exactly once while keeping projectCount accurate', async () => {
    const admin = await roleSession('+919800002105', 'admin');
    const { designer, project } = await makeCompleteProject();

    const claim = await app.request(`/api/admin/projects/${project.id}/start-review`, {
      method: 'POST',
      headers: { cookie: admin.cookie },
    });
    expect(claim.status).toBe(200);
    const claimed = (await claim.json()) as AdminModerationDetailResponse;
    expect(claimed.project).toMatchObject({
      status: 'in_review',
      reviewedBy: admin.userId,
    });

    const publish = await app.request(`/api/admin/projects/${project.id}/publish`, {
      method: 'POST',
      headers: { cookie: admin.cookie },
    });
    expect(publish.status).toBe(200);
    const published = (await publish.json()) as AdminModerationDetailResponse;
    expect(published.project.status).toBe('published');
    expect(published.project.publishedAt).toEqual(expect.any(String));

    const duplicatePublish = await app.request(`/api/admin/projects/${project.id}/publish`, {
      method: 'POST',
      headers: { cookie: admin.cookie },
    });
    expect(duplicatePublish.status).toBe(409);
    const conflict = (await duplicatePublish.json()) as ErrorResponse;
    expect(conflict.error.code).toBe('invalid_transition');

    const [profile] = await db
      .select()
      .from(schema.designerProfile)
      .where(eq(schema.designerProfile.id, designer.id));
    expect(profile?.projectCount).toBe(1);

    const events = await db
      .select()
      .from(schema.projectModerationEvent)
      .where(eq(schema.projectModerationEvent.projectId, project.id));
    expect(events.map((event) => event.action)).toEqual(['start_review', 'publish']);
  });

  it('rejects start-review for a published project without changing publication state', async () => {
    const admin = await roleSession('+919800002114', 'admin');
    const published = await makeCompleteProject({
      status: 'published',
      publishedAt: new Date('2026-07-24T10:00:00.000Z'),
    });
    await db
      .update(schema.designerProfile)
      .set({ projectCount: 1 })
      .where(eq(schema.designerProfile.id, published.designer.id));

    const response = await app.request(
      `/api/admin/projects/${published.project.id}/start-review`,
      {
        method: 'POST',
        headers: { cookie: admin.cookie },
      },
    );

    expect(response.status).toBe(409);
    const [project, profile, events] = await Promise.all([
      db
        .select()
        .from(schema.project)
        .where(eq(schema.project.id, published.project.id))
        .then(([row]) => row),
      db
        .select()
        .from(schema.designerProfile)
        .where(eq(schema.designerProfile.id, published.designer.id))
        .then(([row]) => row),
      db
        .select()
        .from(schema.projectModerationEvent)
        .where(eq(schema.projectModerationEvent.projectId, published.project.id)),
    ]);
    expect(project?.status).toBe('published');
    expect(profile?.projectCount).toBe(1);
    expect(events).toHaveLength(0);
  });

  it('rejects unpublish for a submitted project without claiming it', async () => {
    const admin = await roleSession('+919800002115', 'admin');
    const submitted = await makeCompleteProject();

    const response = await app.request(`/api/admin/projects/${submitted.project.id}/unpublish`, {
      method: 'POST',
      headers: { cookie: admin.cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ note: 'This endpoint must only unpublish live projects.' }),
    });

    expect(response.status).toBe(409);
    const [project] = await db
      .select()
      .from(schema.project)
      .where(eq(schema.project.id, submitted.project.id));
    expect(project).toMatchObject({
      status: 'submitted',
      reviewedBy: null,
      reviewStartedAt: null,
    });
    const events = await db
      .select()
      .from(schema.projectModerationEvent)
      .where(eq(schema.projectModerationEvent.projectId, submitted.project.id));
    expect(events).toHaveLength(0);
  });

  it('supports change requests, rejection, and symmetric unpublish behavior', async () => {
    const admin = await roleSession('+919800002106', 'admin');
    const changes = await makeCompleteProject({ status: 'in_review', reviewedBy: admin.userId });
    const changeResponse = await app.request(
      `/api/admin/projects/${changes.project.id}/request-changes`,
      {
        method: 'POST',
        headers: { cookie: admin.cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ note: 'Add clearer room labels.' }),
      },
    );
    expect(changeResponse.status).toBe(200);
    expect((await changeResponse.json()) as AdminModerationDetailResponse).toMatchObject({
      project: {
        status: 'changes_requested',
        moderationNote: 'Add clearer room labels.',
      },
    });

    const rejection = await makeCompleteProject({ status: 'in_review', reviewedBy: admin.userId });
    const rejectResponse = await app.request(`/api/admin/projects/${rejection.project.id}/reject`, {
      method: 'POST',
      headers: { cookie: admin.cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ note: 'Portfolio mismatch.', reasonCode: 'portfolio-mismatch' }),
    });
    expect(rejectResponse.status).toBe(200);
    expect((await rejectResponse.json()) as AdminModerationDetailResponse).toMatchObject({
      project: {
        status: 'rejected',
        moderationNote: 'Portfolio mismatch.',
        rejectionReasonCode: 'portfolio-mismatch',
      },
    });

    const published = await makeCompleteProject({ status: 'published', publishedAt: new Date() });
    await db
      .update(schema.designerProfile)
      .set({ projectCount: 1 })
      .where(eq(schema.designerProfile.id, published.designer.id));
    const unpublish = await app.request(`/api/admin/projects/${published.project.id}/unpublish`, {
      method: 'POST',
      headers: { cookie: admin.cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ note: 'Returning this project to review.' }),
    });
    expect(unpublish.status).toBe(200);
    const [profile] = await db
      .select()
      .from(schema.designerProfile)
      .where(eq(schema.designerProfile.id, published.designer.id));
    expect(profile?.projectCount).toBe(0);
  });

  it('audits allowlisted corrections only while a project is in review', async () => {
    const admin = await roleSession('+919800002107', 'admin');
    const review = await makeCompleteProject({
      status: 'in_review',
      reviewedBy: admin.userId,
      title: 'Original title',
    });
    const featuredAt = '2026-07-23T12:00:00.000Z';

    const correction = await app.request(`/api/admin/projects/${review.project.id}`, {
      method: 'PATCH',
      headers: { cookie: admin.cookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Corrected title',
        metadata: { reviewed: true },
        featuredAt,
      }),
    });
    expect(correction.status).toBe(200);
    expect((await correction.json()) as AdminModerationDetailResponse).toMatchObject({
      project: {
        title: 'Corrected title',
        metadata: { reviewed: true },
        featuredAt,
      },
    });

    const [event] = await db
      .select()
      .from(schema.projectModerationEvent)
      .where(eq(schema.projectModerationEvent.projectId, review.project.id));
    expect(event).toMatchObject({
      action: 'metadata_corrected',
      fromStatus: 'in_review',
      toStatus: 'in_review',
      fieldDiff: {
        title: { from: 'Original title', to: 'Corrected title' },
        metadata: { from: {}, to: { reviewed: true } },
        featuredAt: { from: null, to: featuredAt },
      },
    });

    const submitted = await makeCompleteProject({ status: 'submitted' });
    const outsideReview = await app.request(`/api/admin/projects/${submitted.project.id}`, {
      method: 'PATCH',
      headers: { cookie: admin.cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Not allowed yet' }),
    });
    expect(outsideReview.status).toBe(409);

    const restricted = await app.request(`/api/admin/projects/${review.project.id}`, {
      method: 'PATCH',
      headers: { cookie: admin.cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ description: 'Not an allowlisted correction' }),
    });
    expect(restricted.status).toBe(422);
  });

  it('merges metadata corrections without removing existing processing provenance', async () => {
    const admin = await roleSession('+919800002116', 'admin');
    const mediaProcessingFailure = {
      imageId: '77777777-7777-4777-8777-777777777777',
      reason: 'Image processing failed.',
      recordedAt: '2026-07-24T10:00:00.000Z',
    };
    const review = await makeCompleteProject({
      status: 'in_review',
      reviewedBy: admin.userId,
      metadata: { mediaProcessingFailure, source: 'worker' },
    });

    const response = await app.request(`/api/admin/projects/${review.project.id}`, {
      method: 'PATCH',
      headers: { cookie: admin.cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ metadata: { reviewed: true } }),
    });

    expect(response.status).toBe(200);
    expect((await response.json()) as AdminModerationDetailResponse).toMatchObject({
      project: {
        metadata: {
          mediaProcessingFailure,
          source: 'worker',
          reviewed: true,
        },
      },
    });
  });

  it('enforces claim ownership while allowing a superadmin override', async () => {
    const owner = await roleSession('+919800002109', 'admin');
    const otherAdmin = await roleSession('+919800002110', 'admin');
    const superadmin = await roleSession('+919800002111', 'superadmin');
    const review = await makeCompleteProject({
      status: 'in_review',
      reviewedBy: owner.userId,
    });

    const forbidden = await app.request(`/api/admin/projects/${review.project.id}/publish`, {
      method: 'POST',
      headers: { cookie: otherAdmin.cookie },
    });
    expect(forbidden.status).toBe(403);

    const publish = await app.request(`/api/admin/projects/${review.project.id}/publish`, {
      method: 'POST',
      headers: { cookie: superadmin.cookie },
    });
    expect(publish.status).toBe(200);
  });

  it('rejects publication when current project completeness has regressed', async () => {
    const admin = await roleSession('+919800002112', 'admin');
    const review = await makeCompleteProject({
      status: 'in_review',
      reviewedBy: admin.userId,
    });
    await db
      .update(schema.projectImage)
      .set({ status: 'processing', updatedAt: new Date() })
      .where(eq(schema.projectImage.id, review.images[0]!.id));

    const queueResponse = await app.request('/api/admin/projects?status=in_review', {
      headers: { cookie: admin.cookie },
    });
    expect(queueResponse.status).toBe(200);
    expect((await queueResponse.json()) as AdminModerationQueueResponse).toMatchObject({
      items: [
        {
          id: review.project.id,
          imageCount: 2,
          completeness: { complete: false },
        },
      ],
    });

    const detailResponse = await app.request(`/api/admin/projects/${review.project.id}`, {
      headers: { cookie: admin.cookie },
    });
    expect(detailResponse.status).toBe(200);
    expect((await detailResponse.json()) as AdminModerationDetailResponse).toMatchObject({
      completeness: { complete: false },
    });

    const response = await app.request(`/api/admin/projects/${review.project.id}/publish`, {
      method: 'POST',
      headers: { cookie: admin.cookie },
    });
    expect(response.status).toBe(409);
    expect((await response.json()) as ErrorResponse).toMatchObject({
      error: { code: 'conflict', message: 'Project is incomplete and cannot be published' },
    });
  });

  it('allows only one metadata correction from the same observed revision', async () => {
    const admin = await roleSession('+919800002113', 'admin');
    const review = await makeCompleteProject({
      status: 'in_review',
      reviewedBy: admin.userId,
      title: 'Before concurrent correction',
    });
    const correct = (title: string) =>
      adminProjectsRepository.correctMetadata({
        projectId: review.project.id,
        actorUserId: admin.userId,
        patch: { title },
        fieldDiff: {
          title: { from: 'Before concurrent correction', to: title },
        },
        expectedRevision: 0,
      });

    const results = await Promise.all([correct('Correction A'), correct('Correction B')]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(results.filter((result) => result === null)).toHaveLength(1);

    const events = await db
      .select()
      .from(schema.projectModerationEvent)
      .where(eq(schema.projectModerationEvent.projectId, review.project.id));
    expect(events).toHaveLength(1);
    expect(events[0]?.action).toBe('metadata_corrected');
  });
});
