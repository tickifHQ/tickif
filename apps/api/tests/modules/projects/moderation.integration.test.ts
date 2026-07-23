import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type {
  ErrorResponse,
  ModerationHistoryResponse,
  ProjectDetailResponse,
} from '@repo/contracts';
import { db, schema } from '@repo/db';
import {
  makeDesigner,
  makeProject,
  makeProjectImage,
  makeProjectRoom,
} from '@repo/db/testing';
import { app } from '../../../src/app.js';
import { projectsRepository } from '../../../src/modules/projects/repository.js';
import { createRoleSession } from '../../helpers/auth.js';

async function makeDesignerSession(phoneNumber: string) {
  const { cookie, userId } = await createRoleSession(phoneNumber, 'designer');
  const designer = await makeDesigner({ userId });
  await db.insert(schema.member).values({
    id: `mem-${userId}`,
    organizationId: designer.orgId,
    userId,
    role: 'owner',
    createdAt: new Date(),
  });
  return { cookie, userId, designer };
}

describe('project moderation transitions', () => {
  it('withdraws a submitted project, clears submittedAt, and records masked history', async () => {
    const { cookie, designer } = await makeDesignerSession('+919800002081');
    const project = await makeProject({
      designerId: designer.id,
      status: 'submitted',
      submittedAt: new Date('2026-07-23T10:00:00.000Z'),
    });

    const withdraw = await app.request(`/api/projects/${project.id}/withdraw`, {
      method: 'POST',
      headers: { cookie },
    });
    expect(withdraw.status).toBe(200);
    const withdrawn = (await withdraw.json()) as ProjectDetailResponse;
    expect(withdrawn).toMatchObject({
      id: project.id,
      status: 'draft',
      submittedAt: null,
    });

    const history = await app.request(`/api/projects/${project.id}/moderation-history`, {
      headers: { cookie },
    });
    expect(history.status).toBe(200);
    const body = (await history.json()) as ModerationHistoryResponse;
    expect(body.items).toEqual([
      expect.objectContaining({
        action: 'withdraw',
        fromStatus: 'submitted',
        toStatus: 'draft',
        actorLabel: 'Tickif Review Team',
      }),
    ]);
    expect(body.items[0]).not.toHaveProperty('actorUserId');
  });

  it('allows exactly one of two concurrent withdrawals', async () => {
    const { cookie, designer } = await makeDesignerSession('+919800002082');
    const project = await makeProject({
      designerId: designer.id,
      status: 'submitted',
      submittedAt: new Date(),
    });

    const responses = await Promise.all([
      app.request(`/api/projects/${project.id}/withdraw`, {
        method: 'POST',
        headers: { cookie },
      }),
      app.request(`/api/projects/${project.id}/withdraw`, {
        method: 'POST',
        headers: { cookie },
      }),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);

    const conflict = responses.find((response) => response.status === 409);
    const body = (await conflict?.json()) as ErrorResponse;
    expect(body.error.code).toBe('INVALID_TRANSITION');

    const events = await db
      .select()
      .from(schema.projectModerationEvent)
      .where(eq(schema.projectModerationEvent.projectId, project.id));
    expect(events).toHaveLength(1);
  });

  it('allows exactly one of two concurrent submissions', async () => {
    const { cookie, designer } = await makeDesignerSession('+919800002086');
    const project = await makeProject({
      designerId: designer.id,
      status: 'draft',
      citySlug: 'mumbai',
      propertyTypeSlug: 'residential',
      scopeSlug: 'full-home',
      budgetBandSlug: 'premium',
    });
    const room = await makeProjectRoom({ projectId: project.id });
    for (let index = 0; index < 3; index += 1) {
      await makeProjectImage({
        projectId: project.id,
        roomId: room.id,
        status: 'ready',
        themeSlugs: ['modern'],
        finishSlugs: ['veneer'],
      });
    }

    const responses = await Promise.all([
      app.request(`/api/projects/${project.id}/submit`, {
        method: 'POST',
        headers: { cookie },
      }),
      app.request(`/api/projects/${project.id}/submit`, {
        method: 'POST',
        headers: { cookie },
      }),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);

    const events = await db
      .select()
      .from(schema.projectModerationEvent)
      .where(eq(schema.projectModerationEvent.projectId, project.id));
    expect(events).toEqual([
      expect.objectContaining({
        action: 'submit',
        fromStatus: 'draft',
        toStatus: 'submitted',
      }),
    ]);
  });

  it('rolls back the status update when the audit insert fails', async () => {
    const { designer } = await makeDesignerSession('+919800002083');
    const project = await makeProject({
      designerId: designer.id,
      status: 'submitted',
      submittedAt: new Date(),
    });

    await expect(
      projectsRepository.transition({
        id: project.id,
        fromStatus: 'submitted',
        toStatus: 'draft',
        actorUserId: 'missing-user',
        action: 'withdraw',
        patch: { submittedAt: null },
      }),
    ).rejects.toThrow();

    const [persisted] = await db
      .select()
      .from(schema.project)
      .where(eq(schema.project.id, project.id));
    expect(persisted).toMatchObject({
      status: 'submitted',
      submittedAt: expect.any(Date),
    });

    const events = await db
      .select()
      .from(schema.projectModerationEvent)
      .where(eq(schema.projectModerationEvent.projectId, project.id));
    expect(events).toHaveLength(0);
  });

  it('rejects history reads by a different designer', async () => {
    const owner = await makeDesignerSession('+919800002084');
    const stranger = await makeDesignerSession('+919800002085');
    const project = await makeProject({ designerId: owner.designer.id, status: 'submitted' });

    const response = await app.request(`/api/projects/${project.id}/moderation-history`, {
      headers: { cookie: stranger.cookie },
    });
    expect(response.status).toBe(403);
  });

  it('retains moderation history by preventing a withdrawn project from being deleted', async () => {
    const { cookie, designer } = await makeDesignerSession('+919800002087');
    const project = await makeProject({
      designerId: designer.id,
      status: 'submitted',
      submittedAt: new Date(),
    });
    const withdraw = await app.request(`/api/projects/${project.id}/withdraw`, {
      method: 'POST',
      headers: { cookie },
    });
    expect(withdraw.status).toBe(200);

    const deletion = await app.request(`/api/projects/${project.id}`, {
      method: 'DELETE',
      headers: { cookie },
    });
    expect(deletion.status).toBe(409);

    const events = await db
      .select()
      .from(schema.projectModerationEvent)
      .where(eq(schema.projectModerationEvent.projectId, project.id));
    expect(events).toHaveLength(1);
  });
});
