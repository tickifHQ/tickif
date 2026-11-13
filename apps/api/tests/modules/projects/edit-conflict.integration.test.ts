import { describe, expect, it } from 'vitest';
import { PROJECT_ERROR_CODE, projectDetailResponseSchema } from '@repo/contracts';
import { db, eq, schema } from '@repo/db';
import {
  makeDesigner,
  makeProject,
  makeUser,
  makeProjectImage,
  makeProjectRoom,
  makeTaxonomy,
} from '@repo/db/testing';
import { app } from '../../../src/app.js';
import { adminProjectsRepository } from '../../../src/modules/admin-projects/repository.js';
import { activateOrganization, createRoleSession } from '../../helpers/auth.js';

async function ownerSession(phoneNumber: string) {
  const { cookie, userId } = await createRoleSession(phoneNumber, 'designer');
  const designer = await makeDesigner({ userId, status: 'active' });
  await db.insert(schema.member).values({
    id: `edit-conflict-${userId}`,
    organizationId: designer.orgId,
    userId,
    role: 'owner',
    createdAt: new Date(),
  });
  return { cookie: await activateOrganization(cookie, designer.orgId), designer };
}

function send(path: string, method: string, cookie: string, body?: unknown) {
  return app.request(path, {
    method,
    headers: { 'content-type': 'application/json', cookie },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function openEditor(projectId: string, cookie: string) {
  const response = await send(`/api/projects/${projectId}`, 'GET', cookie);
  expect(response.status).toBe(200);
  return projectDetailResponseSchema.parse(await response.json());
}

describe('PATCH /api/projects/:id edit revisions', () => {
  it('rejects a stale tab’s whole-form save so the other tab’s title survives', async () => {
    const { cookie, designer } = await ownerSession('+919800007101');
    const project = await makeProject({
      designerId: designer.id,
      status: 'draft',
      title: 'Original title',
      description: 'Original description',
    });
    const tabA = await openEditor(project.id, cookie);
    const tabB = await openEditor(project.id, cookie);

    const savedA = await send(`/api/projects/${project.id}`, 'PATCH', cookie, {
      title: 'Tab A title',
      description: 'Original description',
      expectedEditRevision: tabA.editRevision,
    });
    expect(savedA.status).toBe(200);
    const afterA = projectDetailResponseSchema.parse(await savedA.json());
    expect(afterA.editRevision).toBe(tabA.editRevision + 1);

    const staleB = await send(`/api/projects/${project.id}`, 'PATCH', cookie, {
      title: 'Original title',
      description: 'Tab B description',
      expectedEditRevision: tabB.editRevision,
    });
    expect(staleB.status).toBe(409);
    expect(await staleB.json()).toMatchObject({
      error: { code: PROJECT_ERROR_CODE.EDIT_CONFLICT },
    });

    const reloaded = await openEditor(project.id, cookie);
    expect(reloaded).toMatchObject({
      title: 'Tab A title',
      description: 'Original description',
      editRevision: afterA.editRevision,
    });

    const retriedB = await send(`/api/projects/${project.id}`, 'PATCH', cookie, {
      title: 'Tab A title',
      description: 'Tab B description',
      expectedEditRevision: reloaded.editRevision,
    });
    expect(retriedB.status).toBe(200);
  });

  it('checks the revision of a published project’s pending version', async () => {
    const { cookie, designer } = await ownerSession('+919800007102');
    const project = await makeProject({
      designerId: designer.id,
      status: 'published',
      title: 'Approved title',
      description: 'Approved description',
      publishedAt: new Date('2026-01-01T00:00:00Z'),
    });
    const room = await makeProjectRoom({ projectId: project.id });
    const cover = await makeProjectImage({
      projectId: project.id,
      roomId: room.id,
      status: 'ready',
    });
    await db
      .update(schema.project)
      .set({ coverImageId: cover.id })
      .where(eq(schema.project.id, project.id));
    const tabA = await openEditor(project.id, cookie);
    const tabB = await openEditor(project.id, cookie);

    const materialA = await send(`/api/projects/${project.id}`, 'PATCH', cookie, {
      title: 'Pending title',
      expectedEditRevision: tabA.editRevision,
    });
    expect(materialA.status).toBe(200);
    expect(projectDetailResponseSchema.parse(await materialA.json())).toMatchObject({
      title: 'Pending title',
      pendingChanges: true,
    });

    const staleB = await send(`/api/projects/${project.id}`, 'PATCH', cookie, {
      title: 'Approved title',
      description: 'Tab B description',
      expectedEditRevision: tabB.editRevision,
    });
    expect(staleB.status).toBe(409);

    const reloaded = await openEditor(project.id, cookie);
    expect(reloaded).toMatchObject({
      title: 'Pending title',
      description: 'Approved description',
      pendingChanges: true,
    });
    const retriedB = await send(`/api/projects/${project.id}`, 'PATCH', cookie, {
      description: 'Tab B description',
      expectedEditRevision: reloaded.editRevision,
    });
    expect(retriedB.status).toBe(200);
  });

  it('rejects a tab opened before a reviewer corrected the project', async () => {
    const { cookie, designer } = await ownerSession('+919800007104');
    const reviewer = await makeUser({ role: 'admin' });
    const project = await makeProject({
      designerId: designer.id,
      status: 'draft',
      title: 'Designer title',
    });
    const staleTab = await openEditor(project.id, cookie);
    await db
      .update(schema.project)
      .set({ status: 'in_review', reviewedBy: reviewer.id })
      .where(eq(schema.project.id, project.id));
    const corrected = await adminProjectsRepository.correctMetadata({
      projectId: project.id,
      actorUserId: reviewer.id,
      patch: { title: 'Reviewer title' },
      fieldDiff: { title: { from: 'Designer title', to: 'Reviewer title' } },
      expectedRevision: 0,
    });
    expect(corrected).not.toBeNull();
    await db
      .update(schema.project)
      .set({ status: 'changes_requested' })
      .where(eq(schema.project.id, project.id));

    const stale = await send(`/api/projects/${project.id}`, 'PATCH', cookie, {
      title: 'Designer title',
      expectedEditRevision: staleTab.editRevision,
    });

    expect(stale.status).toBe(409);
    expect((await openEditor(project.id, cookie)).title).toBe('Reviewer title');
  });

  it('keeps the revision when the same tab edits rooms and photos between saves', async () => {
    const { cookie, designer } = await ownerSession('+919800007103');
    const roomType = await makeTaxonomy({ kind: 'room' });
    const project = await makeProject({ designerId: designer.id, status: 'draft' });
    const room = await makeProjectRoom({ projectId: project.id, roomTypeId: roomType.id });
    const image = await makeProjectImage({ projectId: project.id, status: 'ready' });
    const tab = await openEditor(project.id, cookie);

    expect(
      (
        await send(`/api/projects/${project.id}/rooms`, 'POST', cookie, {
          roomTypeId: roomType.id,
          name: 'Study',
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await send(`/api/projects/${project.id}/images/${image.id}`, 'PATCH', cookie, {
          roomId: room.id,
          sortOrder: 0,
        })
      ).status,
    ).toBe(200);

    const saved = await send(`/api/projects/${project.id}`, 'PATCH', cookie, {
      title: 'Saved after photo edits',
      coverImageId: image.id,
      expectedEditRevision: tab.editRevision,
    });
    expect(saved.status).toBe(200);
  });
});
