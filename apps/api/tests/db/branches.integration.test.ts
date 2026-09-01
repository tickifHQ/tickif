import { beforeEach, describe, expect, it } from 'vitest';
import { and, db, eq, schema } from '@repo/db';
import {
  makeDesigner,
  makeOrganization,
  makeProject,
  makeTeam,
  makeUser,
  truncateAll,
} from '@repo/db/testing';
import { orgsRepository } from '../../src/modules/orgs/repository.js';
import { projectsRepository } from '../../src/modules/projects/repository.js';
import { leadsRepository } from '../../src/modules/leads/repository.js';
import { app } from '../../src/app.js';
import { activateOrganization, createRoleSession } from '../helpers/auth.js';

async function makeOwnerSession(tier: 'hobby' | 'corporate') {
  const session = await createRoleSession(`+9198${Date.now().toString().slice(-8)}`, 'designer');
  const organization = await makeOrganization();
  await db.insert(schema.member).values({
    id: `owner-${session.userId}`,
    organizationId: organization.id,
    userId: session.userId,
    role: 'owner',
    createdAt: new Date(),
  });
  await makeDesigner({
    orgId: organization.id,
    userId: session.userId,
    slug: `${tier}-default-branch`,
  });
  if (tier === 'corporate') {
    await db.insert(schema.subscription).values({
      organizationId: organization.id,
      planTier: 'corporate',
    });
  }
  return {
    organization,
    userId: session.userId,
    cookie: await activateOrganization(session.cookie, organization.id),
  };
}

function createBranch(cookie: string, organizationId: string, name: string) {
  return app.request('/api/auth/organization/create-team', {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ organizationId, name }),
  });
}

describe('corporate branch persistence', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it('scopes projects and leads to the active branch', async () => {
    const user = await makeUser();
    const organization = await makeOrganization();
    await db.insert(schema.member).values({
      id: 'member-1',
      organizationId: organization.id,
      userId: user.id,
      role: 'owner',
      createdAt: new Date(),
    });
    const firstTeam = await makeTeam({ organizationId: organization.id, name: 'Mumbai' });
    const secondTeam = await makeTeam({ organizationId: organization.id, name: 'Pune' });
    const firstProfile = await makeDesigner({
      orgId: organization.id,
      teamId: firstTeam.id,
      userId: user.id,
      slug: 'mumbai-studio',
    });
    const secondProfile = await makeDesigner({
      orgId: organization.id,
      teamId: secondTeam.id,
      userId: user.id,
      slug: 'pune-studio',
    });
    await makeProject({ designerId: firstProfile.id, title: 'Mumbai Home', status: 'draft' });
    await makeProject({ designerId: secondProfile.id, title: 'Pune Home', status: 'draft' });
    await leadsRepository.create({
      organizationId: organization.id,
      teamId: firstTeam.id,
      name: 'Mumbai Lead',
      contactNumber: '+919800000001',
    });
    await leadsRepository.create({
      organizationId: organization.id,
      teamId: secondTeam.id,
      name: 'Pune Lead',
      contactNumber: '+919800000002',
    });

    const projects = await projectsRepository.list({
      userId: user.id,
      activeOrgId: organization.id,
      activeTeamId: firstTeam.id,
      limit: 20,
      offset: 0,
      sort: '-updatedAt',
    });
    const leads = await leadsRepository.list({
      userId: user.id,
      activeOrgId: organization.id,
      activeTeamId: firstTeam.id,
      limit: 20,
      offset: 0,
    });

    expect(projects.items.map(({ title }) => title)).toEqual(['Mumbai Home']);
    expect(leads.items.map(({ name }) => name)).toEqual(['Mumbai Lead']);
  });

  it('creates branch profiles for Corporate and gives Hobby a tier error', async () => {
    const corporate = await makeOwnerSession('corporate');
    const created = await createBranch(
      corporate.cookie,
      corporate.organization.id,
      'Bengaluru',
    );
    expect(created.status).toBe(200);
    const team = (await created.json()) as { id: string };
    const [profile] = await db
      .select()
      .from(schema.designerProfile)
      .where(eq(schema.designerProfile.teamId, team.id));
    expect(profile).toMatchObject({
      orgId: corporate.organization.id,
      displayName: 'Bengaluru',
    });
    expect(profile?.slug).toMatch(/^bengaluru-/);

    await truncateAll();
    const hobby = await makeOwnerSession('hobby');
    const rejected = await createBranch(hobby.cookie, hobby.organization.id, 'Not Allowed');
    expect(rejected.status).toBe(402);
    expect(await rejected.json()).toMatchObject({ code: 'BRANCHES_REQUIRE_CORPORATE' });
  });

  it('freezes newest branches first and keeps published projects public', async () => {
    const organization = await makeOrganization();
    const oldest = await makeTeam({
      organizationId: organization.id,
      name: 'Oldest',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    const middle = await makeTeam({
      organizationId: organization.id,
      name: 'Middle',
      createdAt: new Date('2026-02-01T00:00:00.000Z'),
    });
    const newest = await makeTeam({
      organizationId: organization.id,
      name: 'Newest',
      createdAt: new Date('2026-03-01T00:00:00.000Z'),
    });
    await makeDesigner({ orgId: organization.id, teamId: oldest.id, slug: 'oldest' });
    await makeDesigner({ orgId: organization.id, teamId: middle.id, slug: 'middle' });
    const newestProfile = await makeDesigner({
      orgId: organization.id,
      teamId: newest.id,
      slug: 'newest',
      status: 'active',
    });
    const published = await makeProject({
      designerId: newestProfile.id,
      status: 'published',
      publishedAt: new Date(),
    });

    const frozen = await orgsRepository.freezeBranchesToLimit({
      organizationId: organization.id,
      activeLimit: 1,
      now: new Date('2026-04-01T00:00:00.000Z'),
    });
    expect(frozen).toEqual([newest.id, middle.id]);
    const frozenRows = await db
      .select({ id: schema.team.id, rank: schema.team.freezeRank })
      .from(schema.team)
      .where(and(eq(schema.team.organizationId, organization.id), eq(schema.team.frozen, true)));
    expect(new Map(frozenRows.map((row) => [row.id, row.rank]))).toEqual(
      new Map([
        [newest.id, 1],
        [middle.id, 2],
      ]),
    );
    expect(await projectsRepository.findPublicProjectById(published.id)).not.toBeNull();

    const restored = await orgsRepository.restoreBranchesToLimit({
      organizationId: organization.id,
      activeLimit: -1,
    });
    expect(restored).toEqual([newest.id, middle.id]);
  });
});
