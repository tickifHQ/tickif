import { describe, expect, it } from 'vitest';
import { db, eq, schema } from '@repo/db';
import { makeDesigner, makeProject, makeProjectImage, makeProjectRoom } from '@repo/db/testing';
import type { ProjectDetailResponse } from '@repo/contracts';
import { app } from '../../../src/app.js';
import { projectsRepository } from '../../../src/modules/projects/repository.js';
import { createRoleSession } from '../../helpers/auth.js';

async function versionFixture(reject = true) {
  const { cookie, userId } = await createRoleSession('+919800252901', 'superadmin');
  const designer = await makeDesigner({ status: 'active' });
  const project = await makeProject({ designerId: designer.id, status: 'published' });
  const liveRoom = await makeProjectRoom({ projectId: project.id, name: 'Approved living room' });
  const hiddenRoom = await makeProjectRoom({
    projectId: project.id,
    name: 'Rejected bedroom',
    isLive: false,
  });
  const liveImage = await makeProjectImage({
    projectId: project.id,
    roomId: liveRoom.id,
    status: 'ready',
  });
  const hiddenImage = await makeProjectImage({
    projectId: project.id,
    roomId: hiddenRoom.id,
    status: 'ready',
    isLive: false,
  });
  const [liveProject] = await db
    .update(schema.project)
    .set({ coverImageId: liveImage.id })
    .where(eq(schema.project.id, project.id))
    .returning();
  if (!liveProject) throw new Error('Missing project fixture');
  await db.insert(schema.projectPendingVersion).values({
    projectId: project.id,
    status: 'in_review',
    revision: 1,
    content: {
      project: { ...liveProject, status: 'in_review', title: 'Rejected project title' },
      rooms: [liveRoom, hiddenRoom],
      images: [liveImage, hiddenImage],
    },
  });
  if (reject) {
    const result = await projectsRepository.transition({
      id: project.id,
      fromStatus: 'in_review',
      toStatus: 'rejected',
      action: 'reject',
      actorUserId: userId,
    });
    expect(result).toMatchObject({ status: 'published' });
  }
  return { cookie, project: liveProject, liveRoom, hiddenRoom, liveImage, hiddenImage };
}

describe('Public project version boundaries', () => {
  it('duplicates the approved title and media through the authenticated route during re-review', async () => {
    const { cookie, project, liveRoom, liveImage } = await versionFixture(false);
    const response = await app.request(`/api/projects/${project.id}/duplicate`, {
      method: 'POST',
      headers: { cookie },
    });
    expect(response.status).toBe(201);
    const body = (await response.json()) as { project: ProjectDetailResponse };
    expect(body.project.title).toBe(`${project.title} Copy`);
    expect(body.project.rooms.map((room) => room.name)).toEqual([liveRoom.name]);
    const images = await db
      .select()
      .from(schema.projectImage)
      .where(eq(schema.projectImage.projectId, body.project.id));
    expect(images).toHaveLength(1);
    expect(images[0]?.originalKey).toBe(liveImage.originalKey);
  });

  it('returns the approved aggregate anonymously while internal review sees pending content', async () => {
    const { cookie, project, liveRoom } = await versionFixture(false);
    const anonymous = await app.request(`/api/projects/${project.id}`);
    expect(anonymous.status).toBe(200);
    const body = (await anonymous.json()) as ProjectDetailResponse;
    expect(body.title).toBe(project.title);
    expect(body.status).toBe('published');
    expect(body.rooms.map((room) => room.id)).toEqual([liveRoom.id]);
    expect(body).not.toHaveProperty('pendingChanges');
    expect(body).not.toHaveProperty('pendingStatus');
    expect(body).not.toHaveProperty('liveVersion');

    const internal = await app.request(`/api/projects/${project.id}`, { headers: { cookie } });
    expect(internal.status).toBe(200);
    expect(await internal.json()).toMatchObject({
      title: 'Rejected project title',
      status: 'in_review',
      pendingChanges: true,
      liveVersion: { title: project.title, status: 'published' },
    });
  });

  it('refuses a rejected image as cover and preserves the approved public version', async () => {
    const { cookie, project, hiddenImage, liveRoom } = await versionFixture();
    const response = await app.request(`/api/projects/${project.id}`, {
      method: 'PATCH',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ coverImageId: hiddenImage.id }),
    });
    expect(response.status).toBe(422);

    const publicResponse = await app.request(`/api/projects/${project.id}`);
    expect(publicResponse.status).toBe(200);
    const body = (await publicResponse.json()) as ProjectDetailResponse;
    expect(body.title).toBe(project.title);
    expect(body.coverImageId).toBe(project.coverImageId);
    expect(body.rooms.map((room) => room.id)).toEqual([liveRoom.id]);
    expect(body).not.toHaveProperty('pendingChanges');
    expect(body).not.toHaveProperty('liveVersion');
    expect((await app.request(`/api/projects/images/${hiddenImage.id}`)).status).toBe(404);
  });

  it('omits discarded rooms and images from editor lookups and copied projects', async () => {
    const { project, liveRoom, hiddenRoom, hiddenImage } = await versionFixture();
    expect((await projectsRepository.listRooms(project.id)).map((room) => room.id)).toEqual([
      liveRoom.id,
    ]);
    expect(await projectsRepository.findRoom(project.id, hiddenRoom.id)).toBeNull();
    expect(await projectsRepository.findImage(project.id, hiddenImage.id)).toBeNull();

    const duplicate = await projectsRepository.duplicateProject({
      source: project,
      title: 'Approved project copy',
      slug: 'approved-project-copy',
    });
    expect(duplicate.rooms.map((room) => room.name)).toEqual([liveRoom.name]);
    const copiedImages = await db
      .select()
      .from(schema.projectImage)
      .where(eq(schema.projectImage.projectId, duplicate.project.id));
    expect(copiedImages).toHaveLength(1);
    expect(copiedImages[0]?.originalKey).not.toBe(hiddenImage.originalKey);
  });

  it('does not hydrate hidden cover data even when a stored cover pointer is invalid', async () => {
    const { project, hiddenImage } = await versionFixture();
    await db
      .update(schema.project)
      .set({ coverImageId: hiddenImage.id })
      .where(eq(schema.project.id, project.id));

    expect(await projectsRepository.findCoverImages([hiddenImage.id], true)).toEqual(new Map());
    const feed = await projectsRepository.listPublishedFeed({ limit: 10, offset: 0 });
    expect(feed.find((item) => item.id === project.id)?.coverStatus).toBeNull();
    const designerFeed = await projectsRepository.listPublishedByDesigner(project.designerId, {
      limit: 10,
      offset: 0,
    });
    expect(designerFeed[0]?.coverStatus).toBeNull();
  });
});
