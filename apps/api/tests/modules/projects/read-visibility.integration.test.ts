import { describe, expect, it } from 'vitest';
import { projectDetailResponseSchema } from '@repo/contracts';
import { db, eq, schema } from '@repo/db';
import { makeDesigner, makeProject, makeProjectImage, makeProjectRoom } from '@repo/db/testing';
import { app } from '../../../src/app.js';
import { activateOrganization, createRoleSession } from '../../helpers/auth.js';

async function designerSession(phoneNumber: string, status: 'active' | 'draft' = 'active') {
  const { cookie, userId } = await createRoleSession(phoneNumber, 'designer');
  const designer = await makeDesigner({ userId, status });
  const memberId = `read-visibility-${userId}`;
  await db.insert(schema.member).values({
    id: memberId,
    organizationId: designer.orgId,
    userId,
    role: 'owner',
    createdAt: new Date(),
  });
  return { cookie: await activateOrganization(cookie, designer.orgId), designer, memberId };
}

async function publishedProject(owner: Awaited<ReturnType<typeof designerSession>>) {
  const project = await makeProject({
    designerId: owner.designer.id,
    status: 'published',
    title: 'Sea-facing apartment',
    publishedAt: new Date('2026-01-01T00:00:00Z'),
    responsibleMemberId: owner.memberId,
    metadata: { internalNote: 'owner-only' },
  });
  const room = await makeProjectRoom({ projectId: project.id });
  const image = await makeProjectImage({
    projectId: project.id,
    roomId: room.id,
    status: 'ready',
    derivatives: [
      {
        variant: 'xlarge',
        format: 'webp',
        key: `derived/${project.id}/x.webp`,
        width: 1,
        height: 1,
      },
    ],
  });
  await db
    .update(schema.project)
    .set({ coverImageId: image.id })
    .where(eq(schema.project.id, project.id));
  return project;
}

function get(path: string, cookie?: string) {
  return app.request(path, cookie ? { headers: { cookie } } : undefined);
}

describe('project reads outside the owning organization', () => {
  it('hides a published project of an inactive studio from every anonymous read', async () => {
    const owner = await designerSession('+919800007201', 'draft');
    const project = await publishedProject(owner);

    const detail = await get(`/api/projects/${project.id}`);
    const gallery = await get(`/api/projects/${project.id}/gallery`);
    const similar = await get(`/api/discovery/similar/${project.id}`);

    expect(detail.status).toBe(404);
    const body = JSON.stringify(await detail.json());
    expect(body).not.toContain('responsibleMemberId');
    expect(body).not.toContain('owner-only');
    expect(gallery.status).toBe(404);
    expect(similar.status).toBe(404);
  });

  it('serves anonymous and cross-organization callers the public read model', async () => {
    const owner = await designerSession('+919800007202');
    const stranger = await designerSession('+919800007203');
    const project = await publishedProject(owner);

    for (const cookie of [undefined, stranger.cookie]) {
      const response = await get(`/api/projects/${project.id}`, cookie);
      expect(response.status).toBe(200);
      const body = (await response.json()) as Record<string, unknown>;
      expect(body).toMatchObject({ id: project.id, title: 'Sea-facing apartment' });
      expect(body).not.toHaveProperty('responsibleMemberId');
      expect(body).not.toHaveProperty('metadata');
      expect(body).not.toHaveProperty('editRevision');
    }

    const ownerRead = await get(`/api/projects/${project.id}`, owner.cookie);
    expect(ownerRead.status).toBe(200);
    expect(projectDetailResponseSchema.parse(await ownerRead.json())).toMatchObject({
      responsibleMemberId: owner.memberId,
      metadata: { internalNote: 'owner-only' },
    });
  });
});
