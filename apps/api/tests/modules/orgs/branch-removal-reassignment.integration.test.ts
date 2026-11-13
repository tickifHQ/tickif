import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { db, eq, schema } from '@repo/db';
import { makeDesigner, makeOrganization, makeTeam, makeUser } from '@repo/db/testing';
import {
  BRANCH_REMOVAL_RESULT,
  removeBranchWithReassignment,
} from '../../../src/modules/orgs/branch-removal-repository.js';

async function twoBranchStudio() {
  const owner = await makeUser();
  const organization = await makeOrganization();
  const sourceTeam = await makeTeam({ organizationId: organization.id, name: 'Source' });
  const targetTeam = await makeTeam({ organizationId: organization.id, name: 'Target' });
  const source = await makeDesigner({
    userId: owner.id,
    orgId: organization.id,
    teamId: sourceTeam.id,
    status: 'active',
  });
  const target = await makeDesigner({
    userId: owner.id,
    orgId: organization.id,
    teamId: targetTeam.id,
    status: 'active',
  });
  await db.insert(schema.member).values({
    id: `branch-removal-owner-${owner.id}`,
    organizationId: organization.id,
    userId: owner.id,
    role: 'owner',
    createdAt: new Date(),
  });
  const remove = () =>
    removeBranchWithReassignment({
      userId: owner.id,
      organizationId: organization.id,
      branchId: sourceTeam.id,
      targetBranchId: targetTeam.id,
    });
  return { source, target, remove };
}

function profileView(designerProfileId: string, actorUserId: string | null) {
  return {
    eventKey: randomUUID(),
    type: 'profile_view' as const,
    anonymousId: randomUUID(),
    actorUserId,
    designerProfileId,
  };
}

describe('branch removal keeps audience data', () => {
  it('moves followers to the surviving branch without duplicating existing follows', async () => {
    const { source, target, remove } = await twoBranchStudio();
    const follower = await makeUser();
    const followsBoth = await makeUser();
    const followedAt = new Date('2026-09-01T00:00:00Z');
    await db.insert(schema.designerFollow).values([
      { userId: follower.id, designerProfileId: source.id, followedAt, lastSeenAt: followedAt },
      { userId: followsBoth.id, designerProfileId: source.id },
      { userId: followsBoth.id, designerProfileId: target.id, followedAt, lastSeenAt: followedAt },
    ]);

    expect(await remove()).toMatchObject({ outcome: BRANCH_REMOVAL_RESULT.REMOVED });

    const follows = await db
      .select({
        userId: schema.designerFollow.userId,
        followedAt: schema.designerFollow.followedAt,
      })
      .from(schema.designerFollow)
      .where(eq(schema.designerFollow.designerProfileId, target.id));
    expect(follows).toHaveLength(2);
    expect(follows).toEqual(
      expect.arrayContaining([
        { userId: follower.id, followedAt },
        { userId: followsBoth.id, followedAt },
      ]),
    );
  });

  it('moves profile-view history and keeps one view per signed-in visitor per day', async () => {
    const { source, target, remove } = await twoBranchStudio();
    const viewer = await makeUser();
    const viewedBoth = await makeUser();
    await db
      .insert(schema.interactionEvent)
      .values([
        profileView(source.id, null),
        profileView(source.id, viewer.id),
        profileView(source.id, viewedBoth.id),
        profileView(target.id, viewedBoth.id),
      ]);

    expect(await remove()).toMatchObject({ outcome: BRANCH_REMOVAL_RESULT.REMOVED });

    const views = await db
      .select({ actorUserId: schema.interactionEvent.actorUserId })
      .from(schema.interactionEvent)
      .where(eq(schema.interactionEvent.designerProfileId, target.id));
    expect(views.map(({ actorUserId }) => actorUserId).sort()).toEqual(
      [null, viewer.id, viewedBoth.id].sort(),
    );
  });
});
