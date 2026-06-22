import { describe, it, expect } from 'vitest';
import { testClient } from 'hono/testing';
import { eq } from 'drizzle-orm';
import type { ListProjectRoomsResponse, ProjectRoom } from '@repo/contracts';
import { db, schema } from '@repo/db';
import {
  makeDesigner,
  makeProject,
  makeProjectImage,
  makeProjectRoom,
  makeTaxonomy,
} from '@repo/db/testing';
import { app } from '../../../src/app.js';
import { createRoleSession } from '../../helpers/auth.js';

const client = testClient(app);

async function makeDesignerSession(phoneNumber = '+919800002001') {
  const { cookie, userId } = await createRoleSession(phoneNumber, 'designer');
  const designer = await makeDesigner({ userId });
  return { cookie, userId, designer };
}

async function requestJson(path: string, method: string, cookie: string | undefined, body: unknown) {
  return app.request(path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe('GET /api/projects', () => {
  it('returns published projects from the DB', async () => {
    const designer = await makeDesigner();
    await makeProject({ designerId: designer.id, title: 'Sunlit Bandra Apartment' });

    const res = await client.api.projects.$get({ query: {} });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.total).toBe(1);
    expect(body.items[0]).toMatchObject({ title: 'Sunlit Bandra Apartment', status: 'published' });
  });

  it('filters by status', async () => {
    const designer = await makeDesigner();
    await makeProject({ designerId: designer.id, status: 'draft' });

    const res = await client.api.projects.$get({ query: { status: 'published' } });
    const body = await res.json();
    expect(body.total).toBe(0);
  });
});

describe('POST /api/projects', () => {
  it('rejects unauthenticated requests with 401', async () => {
    const res = await client.api.projects.$post({
      json: { title: 'New Project' },
    });
    expect(res.status).toBe(401);
  });

  it('creates a project for the authenticated user designer profile (201)', async () => {
    const { cookie, designer } = await makeDesignerSession('+919800002002');

    const res = await client.api.projects.$post(
      { json: { title: 'Authenticated Project' } },
      { headers: { cookie } },
    );

    expect(res.status).toBe(201);
    if (res.status !== 201) throw new Error('expected 201'); // narrows the union
    const body = await res.json();
    expect(body).toMatchObject({
      designerId: designer.id,
      title: 'Authenticated Project',
      status: 'draft',
      rooms: [],
    });
    expect(body.slug).toBe('authenticated-project');
  });
});

describe('Project draft CRUD + rooms (E-102)', () => {
  it('updates draft metadata and sets a same-project cover image', async () => {
    const { cookie, designer } = await makeDesignerSession('+919800002003');
    const project = await makeProject({ designerId: designer.id, status: 'draft' });
    const image = await makeProjectImage({ projectId: project.id });
    await makeTaxonomy({ kind: 'city', slug: 'mumbai', label: 'Mumbai' });

    const res = await requestJson(`/api/projects/${project.id}`, 'PATCH', cookie, {
      title: 'Updated Draft',
      citySlug: 'mumbai',
      coverImageId: image.id,
      metadata: { source: 'draft-builder' },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      id: project.id,
      title: 'Updated Draft',
      citySlug: 'mumbai',
      coverImageId: image.id,
    });
  });

  it('rejects a cover image from another project', async () => {
    const { cookie, designer } = await makeDesignerSession('+919800002004');
    const project = await makeProject({ designerId: designer.id, status: 'draft' });
    const otherImage = await makeProjectImage();

    const res = await requestJson(`/api/projects/${project.id}`, 'PATCH', cookie, {
      coverImageId: otherImage.id,
    });

    expect(res.status).toBe(422);
  });

  it('creates, reorders, updates, lists, and deletes rooms owned by the caller', async () => {
    const { cookie, designer } = await makeDesignerSession('+919800002005');
    const project = await makeProject({ designerId: designer.id, status: 'draft' });
    const living = await makeTaxonomy({ kind: 'room', slug: 'living-room', label: 'Living Room' });
    const kitchen = await makeTaxonomy({ kind: 'room', slug: 'kitchen', label: 'Kitchen' });

    const createLiving = await requestJson(`/api/projects/${project.id}/rooms`, 'POST', cookie, {
      roomTypeId: living.id,
      name: 'Living Room',
      sortOrder: 1,
      metadata: { labels: ['airy'] },
    });
    expect(createLiving.status).toBe(201);
    const livingRoom = (await createLiving.json()) as ProjectRoom;

    const createKitchen = await requestJson(`/api/projects/${project.id}/rooms`, 'POST', cookie, {
      roomTypeId: kitchen.id,
      name: 'Kitchen',
      sortOrder: 0,
    });
    expect(createKitchen.status).toBe(201);
    const kitchenRoom = (await createKitchen.json()) as ProjectRoom;

    const reorder = await requestJson(`/api/projects/${project.id}/rooms/reorder`, 'PATCH', cookie, {
      rooms: [
        { id: livingRoom.id, sortOrder: 0 },
        { id: kitchenRoom.id, sortOrder: 1 },
      ],
    });
    expect(reorder.status).toBe(200);

    const update = await requestJson(
      `/api/projects/${project.id}/rooms/${livingRoom.id}`,
      'PATCH',
      cookie,
      { name: 'Formal Living Room', description: null },
    );
    expect(update.status).toBe(200);
    expect(await update.json()).toMatchObject({ name: 'Formal Living Room' });

    const list = await app.request(`/api/projects/${project.id}/rooms`, {
      headers: { cookie },
    });
    expect(list.status).toBe(200);
    const listed = (await list.json()) as ListProjectRoomsResponse;
    expect(listed.items.map((room) => room.id)).toEqual([
      livingRoom.id,
      kitchenRoom.id,
    ]);

    const del = await app.request(`/api/projects/${project.id}/rooms/${kitchenRoom.id}`, {
      method: 'DELETE',
      headers: { cookie },
    });
    expect(del.status).toBe(200);
  });

  it('rejects non-room taxonomy terms when creating rooms', async () => {
    const { cookie, designer } = await makeDesignerSession('+919800002014');
    const project = await makeProject({ designerId: designer.id, status: 'draft' });
    const city = await makeTaxonomy({ kind: 'city', slug: 'mumbai', label: 'Mumbai' });

    const res = await requestJson(`/api/projects/${project.id}/rooms`, 'POST', cookie, {
      roomTypeId: city.id,
      name: 'Living Room',
    });

    expect(res.status).toBe(422);
  });

  it('links a project image to a same-project room', async () => {
    const { cookie, designer } = await makeDesignerSession('+919800002006');
    const project = await makeProject({ designerId: designer.id, status: 'draft' });
    const room = await makeProjectRoom({ projectId: project.id });
    const image = await makeProjectImage({ projectId: project.id });

    const res = await requestJson(`/api/projects/${project.id}/images/${image.id}`, 'PATCH', cookie, {
      roomId: room.id,
      sortOrder: 3,
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      id: image.id,
      projectId: project.id,
      roomId: room.id,
      sortOrder: 3,
    });
  });

  it('rejects linking an image to a room from another project', async () => {
    const { cookie, designer } = await makeDesignerSession('+919800002015');
    const project = await makeProject({ designerId: designer.id, status: 'draft' });
    const image = await makeProjectImage({ projectId: project.id });
    const otherProject = await makeProject({ designerId: designer.id, status: 'draft' });
    const otherRoom = await makeProjectRoom({ projectId: otherProject.id });

    const res = await requestJson(`/api/projects/${project.id}/images/${image.id}`, 'PATCH', cookie, {
      roomId: otherRoom.id,
    });

    expect(res.status).toBe(422);
  });

  it('deletes owned draft projects and cascades rooms and images', async () => {
    const { cookie, designer } = await makeDesignerSession('+919800002016');
    const project = await makeProject({ designerId: designer.id, status: 'draft' });
    await makeProjectRoom({ projectId: project.id });
    await makeProjectImage({ projectId: project.id });

    const res = await app.request(`/api/projects/${project.id}`, {
      method: 'DELETE',
      headers: { cookie },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: project.id, deleted: true });

    const [projectRows, roomRows, imageRows] = await Promise.all([
      db.select().from(schema.project).where(eq(schema.project.id, project.id)),
      db.select().from(schema.projectRoom).where(eq(schema.projectRoom.projectId, project.id)),
      db.select().from(schema.projectImage).where(eq(schema.projectImage.projectId, project.id)),
    ]);
    expect(projectRows).toHaveLength(0);
    expect(roomRows).toHaveLength(0);
    expect(imageRows).toHaveLength(0);
  });

  it('allows a superadmin to update a draft they do not own', async () => {
    const { designer } = await makeDesignerSession('+919800002017');
    const superadmin = await createRoleSession('+919800002018', 'superadmin');
    const project = await makeProject({ designerId: designer.id, status: 'draft' });

    const res = await requestJson(`/api/projects/${project.id}`, 'PATCH', superadmin.cookie, {
      title: 'Curated by Admin',
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: project.id, title: 'Curated by Admin' });
  });

  it('rejects unknown city and budget taxonomy slugs on create', async () => {
    const { cookie } = await makeDesignerSession('+919800002019');

    const badCity = await requestJson('/api/projects', 'POST', cookie, {
      title: 'Bad City',
      citySlug: 'atlantis',
    });
    expect(badCity.status).toBe(422);

    const badBudget = await requestJson('/api/projects', 'POST', cookie, {
      title: 'Bad Budget',
      budgetBandSlug: 'gazillion',
    });
    expect(badBudget.status).toBe(422);
  });

  it('forbids non-owners from mutating another designer project', async () => {
    const { designer } = await makeDesignerSession('+919800002007');
    const stranger = await makeDesignerSession('+919800002008');
    const project = await makeProject({ designerId: designer.id, status: 'draft' });

    const res = await requestJson(`/api/projects/${project.id}`, 'PATCH', stranger.cookie, {
      title: 'Nope',
    });

    expect(res.status).toBe(403);
  });

  it('forbids same-organization members from mutating an owner draft', async () => {
    const { designer } = await makeDesignerSession('+919800002011');
    const sameOrgMember = await createRoleSession('+919800002012', 'visitor');
    await db.insert(schema.member).values({
      id: `mem-${sameOrgMember.userId}`,
      organizationId: designer.orgId,
      userId: sameOrgMember.userId,
      role: 'member',
      createdAt: new Date(),
    });
    const project = await makeProject({ designerId: designer.id, status: 'draft' });

    const res = await requestJson(`/api/projects/${project.id}`, 'PATCH', sameOrgMember.cookie, {
      title: 'Nope',
    });

    expect(res.status).toBe(403);
  });

  it('does not mutate published projects through draft routes', async () => {
    const { cookie, designer } = await makeDesignerSession('+919800002009');
    const project = await makeProject({ designerId: designer.id, status: 'published' });

    const res = await requestJson(`/api/projects/${project.id}`, 'PATCH', cookie, {
      title: 'Nope',
    });

    expect(res.status).toBe(409);
  });

  it('rejects banned users on draft owner reads', async () => {
    const { cookie, designer, userId } = await makeDesignerSession('+919800002010');
    const project = await makeProject({ designerId: designer.id, status: 'draft' });
    await db.update(schema.user).set({ banned: true }).where(eq(schema.user.id, userId));

    const res = await app.request(`/api/projects/${project.id}`, {
      headers: { cookie },
    });

    expect(res.status).toBe(403);
  });

  it('allows banned users to read published projects through the public route', async () => {
    const { cookie, designer, userId } = await makeDesignerSession('+919800002013');
    const project = await makeProject({ designerId: designer.id, status: 'published' });
    await db.update(schema.user).set({ banned: true }).where(eq(schema.user.id, userId));

    const res = await app.request(`/api/projects/${project.id}`, {
      headers: { cookie },
    });

    expect(res.status).toBe(200);
  });
});
