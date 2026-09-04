import { beforeEach, describe, expect, it } from 'vitest';
import { and, db, eq, inArray, schema } from '@repo/db';
import {
  makeDesigner,
  makeConsultationBooking,
  makeOrganization,
  makeProject,
  makeTeam,
  makeTaxonomy,
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
    status: 'active',
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

function removeBranch(cookie: string, branchId: string, targetBranchId: string) {
  return app.request(`/api/orgs/branches/${branchId}`, {
    method: 'DELETE',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ targetBranchId }),
  });
}

describe('corporate branch persistence', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it('scopes projects and leads to active branches and excludes frozen branches from roll-up', async () => {
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
    const frozenTeam = await makeTeam({
      organizationId: organization.id,
      name: 'Frozen',
      frozen: true,
      frozenAt: new Date(),
      freezeRank: 1,
    });
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
    const frozenProfile = await makeDesigner({
      orgId: organization.id,
      teamId: frozenTeam.id,
      userId: user.id,
      slug: 'frozen-studio',
    });
    await makeProject({ designerId: firstProfile.id, title: 'Mumbai Home', status: 'draft' });
    await makeProject({ designerId: secondProfile.id, title: 'Pune Home', status: 'draft' });
    await makeProject({ designerId: frozenProfile.id, title: 'Frozen Home', status: 'draft' });
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
    await leadsRepository.create({
      organizationId: organization.id,
      teamId: frozenTeam.id,
      name: 'Frozen Lead',
      contactNumber: '+919800000003',
    });
    const teammate = await makeUser({ email: 'branch-teammate@example.com' });
    await db.insert(schema.teamMember).values([
      { id: 'teammate-mumbai', teamId: firstTeam.id, userId: teammate.id },
      { id: 'teammate-pune', teamId: secondTeam.id, userId: teammate.id },
    ]);

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

    const projectRollup = await projectsRepository.list({
      userId: user.id,
      activeOrgId: organization.id,
      activeTeamId: null,
      limit: 20,
      offset: 0,
      sort: 'title',
    });
    const leadRollup = await leadsRepository.list({
      userId: user.id,
      activeOrgId: organization.id,
      activeTeamId: null,
      limit: 20,
      offset: 0,
      sortBy: 'name',
      sortOrder: 'asc',
    });
    const projectCounts = await projectsRepository.countByStatus({
      userId: user.id,
      activeOrgId: organization.id,
      activeTeamId: null,
    });
    const leadCounts = await leadsRepository.countByStatus(organization.id);
    expect(projectRollup.items.map(({ title }) => title)).toEqual(['Mumbai Home', 'Pune Home']);
    expect(projectRollup.total).toBe(2);
    expect(leadRollup.items.map(({ name }) => name)).toEqual(['Mumbai Lead', 'Pune Lead']);
    expect(projectCounts).toEqual([{ status: 'draft', count: 2 }]);
    expect(leadCounts).toEqual([{ status: 'new', count: 2 }]);
  });

  it('creates branch profiles for Corporate and gives Hobby a tier error', async () => {
    const corporate = await makeOwnerSession('corporate');
    const created = await createBranch(corporate.cookie, corporate.organization.id, 'Bengaluru');
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

  it('blocks hard deletion so branch projects cannot cascade', async () => {
    const corporate = await makeOwnerSession('corporate');
    const created = await createBranch(corporate.cookie, corporate.organization.id, 'Pune');
    expect(created.status).toBe(200);
    const team = (await created.json()) as { id: string };
    const [profile] = await db
      .select({ id: schema.designerProfile.id })
      .from(schema.designerProfile)
      .where(eq(schema.designerProfile.teamId, team.id));
    const project = await makeProject({ designerId: profile!.id, status: 'draft' });

    const response = await app.request('/api/auth/organization/remove-team', {
      method: 'POST',
      headers: { cookie: corporate.cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ organizationId: corporate.organization.id, teamId: team.id }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: 'BRANCH_DELETE_NOT_ALLOWED' });
    const [persisted] = await db
      .select({ id: schema.project.id })
      .from(schema.project)
      .where(eq(schema.project.id, project.id));
    expect(persisted?.id).toBe(project.id);
  });

  it('removes a branch while retaining operational data, context, counters, and search events', async () => {
    const corporate = await makeOwnerSession('corporate');
    const [target] = await db
      .select({ id: schema.team.id, profileId: schema.designerProfile.id })
      .from(schema.team)
      .innerJoin(schema.designerProfile, eq(schema.designerProfile.teamId, schema.team.id))
      .where(eq(schema.team.organizationId, corporate.organization.id))
      .limit(1);
    const created = await createBranch(corporate.cookie, corporate.organization.id, 'Pune');
    const source = (await created.json()) as { id: string };
    const [sourceProfile] = await db
      .select({ id: schema.designerProfile.id })
      .from(schema.designerProfile)
      .where(eq(schema.designerProfile.teamId, source.id));
    await db
      .update(schema.designerProfile)
      .set({ status: 'active' })
      .where(eq(schema.designerProfile.id, sourceProfile!.id));
    const targetProject = await makeProject({ designerId: target!.profileId, status: 'published' });
    const project = await makeProject({ designerId: sourceProfile!.id, status: 'published' });
    const lead = await leadsRepository.create({
      organizationId: corporate.organization.id,
      teamId: source.id,
      name: 'Pune Lead',
      contactNumber: '+919800000003',
    });
    const requester = await makeUser({ email: 'branch-requester@example.com' });
    const [enquiry] = await db
      .insert(schema.enquiry)
      .values({
        requesterId: requester.id,
        designerProfileId: sourceProfile!.id,
        organizationId: corporate.organization.id,
        referredProjectId: project.id,
        leadId: lead.id,
        subject: 'Kitchen renovation',
        description: 'Need help redesigning the kitchen.',
        budget: '10-20 lakh',
      })
      .returning();
    const booking = await makeConsultationBooking({
      organizationId: corporate.organization.id,
      designerProfileId: sourceProfile!.id,
      requesterId: requester.id,
      referredProjectId: project.id,
    });
    const reviewTime = new Date('2026-09-01T12:00:00.000Z');
    const targetReviewer = await makeUser({ email: 'target-reviewer@example.com' });
    await db.insert(schema.review).values([
      {
        designerProfileId: target!.profileId,
        authorUserId: targetReviewer.id,
        projectId: targetProject.id,
        rating: 5,
        body: 'Excellent design work with thoughtful attention to every requested detail.',
        status: 'published',
        createdAt: reviewTime,
        updatedAt: reviewTime,
        publishedAt: reviewTime,
        moderatedAt: reviewTime,
      },
      {
        designerProfileId: sourceProfile!.id,
        authorUserId: requester.id,
        projectId: project.id,
        bookingId: booking.id,
        rating: 4,
        body: 'Strong design work and clear communication throughout the entire engagement.',
        status: 'published',
        createdAt: reviewTime,
        updatedAt: reviewTime,
        publishedAt: reviewTime,
        moderatedAt: reviewTime,
      },
    ]);
    await db.insert(schema.bookingNotificationOutbox).values({
      bookingId: booking.id,
      phoneNumber: '+919800000099',
      requesterName: 'Branch Requester',
    });
    await db.insert(schema.invitation).values({
      id: 'branch-removal-invitation',
      organizationId: corporate.organization.id,
      email: 'branch-invitee@example.com',
      role: 'member',
      status: 'pending',
      expiresAt: new Date('2099-01-01T00:00:00.000Z'),
      inviterId: corporate.userId,
      teamId: `${source.id},${target!.id}`,
    });
    await db
      .update(schema.session)
      .set({ activeOrganizationId: corporate.organization.id, activeTeamId: source.id })
      .where(eq(schema.session.userId, corporate.userId));
    await db.insert(schema.userContextPreference).values({
      userId: corporate.userId,
      contextKind: 'organization',
      organizationId: corporate.organization.id,
      teamId: source.id,
    });

    const response = await removeBranch(corporate.cookie, source.id, target!.id);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      removedBranchId: source.id,
      targetBranchId: target!.id,
      reassignedProjectCount: 1,
    });
    const [movedProject] = await db
      .select({ designerId: schema.project.designerId })
      .from(schema.project)
      .where(eq(schema.project.id, project.id));
    const [movedLead] = await db
      .select({ teamId: schema.lead.teamId })
      .from(schema.lead)
      .where(eq(schema.lead.id, lead.id));
    const [movedEnquiry] = await db
      .select({ profileId: schema.enquiry.designerProfileId })
      .from(schema.enquiry)
      .where(eq(schema.enquiry.id, enquiry!.id));
    const [movedBooking] = await db
      .select({ profileId: schema.consultationBooking.designerProfileId })
      .from(schema.consultationBooking)
      .where(eq(schema.consultationBooking.id, booking.id));
    const [movedReview] = await db
      .select({ profileId: schema.review.designerProfileId })
      .from(schema.review)
      .where(eq(schema.review.bookingId, booking.id));
    const [session] = await db
      .select({
        organizationId: schema.session.activeOrganizationId,
        teamId: schema.session.activeTeamId,
      })
      .from(schema.session)
      .where(eq(schema.session.userId, corporate.userId));
    const [preference] = await db
      .select({
        organizationId: schema.userContextPreference.organizationId,
        teamId: schema.userContextPreference.teamId,
      })
      .from(schema.userContextPreference)
      .where(eq(schema.userContextPreference.userId, corporate.userId));
    const [invitation] = await db
      .select({ teamId: schema.invitation.teamId })
      .from(schema.invitation)
      .where(eq(schema.invitation.id, 'branch-removal-invitation'));
    const [targetProfile] = await db
      .select({
        projectCount: schema.designerProfile.projectCount,
        reviewCount: schema.designerProfile.reviewCount,
        averageRating: schema.designerProfile.avgRating,
      })
      .from(schema.designerProfile)
      .where(eq(schema.designerProfile.id, target!.profileId));
    const searchEvents = await db
      .select({
        kind: schema.searchProjectionOutbox.entityKind,
        id: schema.searchProjectionOutbox.entityId,
        operation: schema.searchProjectionOutbox.operation,
      })
      .from(schema.searchProjectionOutbox)
      .where(
        inArray(schema.searchProjectionOutbox.entityId, [
          project.id,
          sourceProfile!.id,
          target!.profileId,
        ]),
      );
    expect(movedProject?.designerId).toBe(target!.profileId);
    expect(movedLead?.teamId).toBe(target!.id);
    expect(movedEnquiry?.profileId).toBe(target!.profileId);
    expect(movedBooking?.profileId).toBe(target!.profileId);
    expect(movedReview?.profileId).toBe(target!.profileId);
    expect(session).toEqual({ organizationId: corporate.organization.id, teamId: null });
    expect(preference).toEqual({ organizationId: corporate.organization.id, teamId: null });
    expect(invitation?.teamId).toBe(target!.id);
    expect(targetProfile).toEqual({ projectCount: 2, reviewCount: 2, averageRating: '4.50' });
    expect(searchEvents).toEqual(
      expect.arrayContaining([
        { kind: 'project', id: project.id, operation: 'index' },
        { kind: 'designer', id: target!.profileId, operation: 'index' },
        { kind: 'designer', id: sourceProfile!.id, operation: 'delete' },
      ]),
    );
    expect(await projectsRepository.findPublicProjectById(project.id)).not.toBeNull();
    expect(
      await db
        .select()
        .from(schema.bookingNotificationOutbox)
        .where(eq(schema.bookingNotificationOutbox.bookingId, booking.id)),
    ).toHaveLength(1);
    expect(await db.select().from(schema.team).where(eq(schema.team.id, source.id))).toHaveLength(
      0,
    );
  });

  it('does not remove the final organization branch', async () => {
    const corporate = await makeOwnerSession('corporate');
    const [onlyBranch] = await db
      .select({ id: schema.team.id })
      .from(schema.team)
      .where(eq(schema.team.organizationId, corporate.organization.id));

    const response = await removeBranch(corporate.cookie, onlyBranch!.id, 'missing-target');

    expect(response.status).toBe(409);
    expect(
      await db.select().from(schema.team).where(eq(schema.team.id, onlyBranch!.id)),
    ).toHaveLength(1);
  });

  it('allows only owners and rejects draft, frozen, and cross-organization targets', async () => {
    const corporate = await makeOwnerSession('corporate');
    const [defaultBranch] = await db
      .select({ id: schema.team.id })
      .from(schema.team)
      .where(eq(schema.team.organizationId, corporate.organization.id));
    const sourceResponse = await createBranch(
      corporate.cookie,
      corporate.organization.id,
      'Source',
    );
    const source = (await sourceResponse.json()) as { id: string };
    const [sourceProfile] = await db
      .update(schema.designerProfile)
      .set({ status: 'active' })
      .where(eq(schema.designerProfile.teamId, source.id))
      .returning({ id: schema.designerProfile.id });
    const publishedProject = await makeProject({
      designerId: sourceProfile!.id,
      status: 'published',
    });
    const targetResponse = await createBranch(
      corporate.cookie,
      corporate.organization.id,
      'Draft Target',
    );
    const target = (await targetResponse.json()) as { id: string };

    expect((await removeBranch(corporate.cookie, source.id, target.id)).status).toBe(422);
    await expect(
      projectsRepository.findPublicProjectById(publishedProject.id),
    ).resolves.not.toBeNull();

    await db
      .update(schema.designerProfile)
      .set({ status: 'active' })
      .where(eq(schema.designerProfile.teamId, target.id));
    await db
      .update(schema.team)
      .set({ frozen: true, frozenAt: new Date(), freezeRank: 1 })
      .where(eq(schema.team.id, target.id));
    expect((await removeBranch(corporate.cookie, source.id, target.id)).status).toBe(422);

    const otherOrganization = await makeOrganization();
    const otherTeam = await makeTeam({ organizationId: otherOrganization.id });
    await makeDesigner({
      orgId: otherOrganization.id,
      teamId: otherTeam.id,
      status: 'active',
    });
    expect((await removeBranch(corporate.cookie, source.id, otherTeam.id)).status).toBe(422);

    await db
      .update(schema.member)
      .set({ role: 'admin' })
      .where(
        and(
          eq(schema.member.userId, corporate.userId),
          eq(schema.member.organizationId, corporate.organization.id),
        ),
      );
    expect((await removeBranch(corporate.cookie, source.id, defaultBranch!.id)).status).toBe(403);
    expect(await db.select().from(schema.team).where(eq(schema.team.id, source.id))).toHaveLength(
      1,
    );
  });

  it('serializes opposite branch removals so one final branch always survives', async () => {
    const corporate = await makeOwnerSession('corporate');
    const [first] = await db
      .select({ id: schema.team.id })
      .from(schema.team)
      .where(eq(schema.team.organizationId, corporate.organization.id));
    const secondResponse = await createBranch(
      corporate.cookie,
      corporate.organization.id,
      'Second Branch',
    );
    const second = (await secondResponse.json()) as { id: string };
    await db
      .update(schema.designerProfile)
      .set({ status: 'active' })
      .where(eq(schema.designerProfile.teamId, second.id));

    const responses = await Promise.all([
      removeBranch(corporate.cookie, first!.id, second.id),
      removeBranch(corporate.cookie, second.id, first!.id),
    ]);

    expect(responses.map(({ status }) => status).sort()).toEqual([200, 409]);
    const remaining = await db
      .select({ id: schema.team.id })
      .from(schema.team)
      .where(eq(schema.team.organizationId, corporate.organization.id));
    expect(remaining).toHaveLength(1);
  });

  it('rolls back removal when branch reviews would violate one-review-per-customer', async () => {
    const corporate = await makeOwnerSession('corporate');
    const [target] = await db
      .select({ id: schema.team.id, profileId: schema.designerProfile.id })
      .from(schema.team)
      .innerJoin(schema.designerProfile, eq(schema.designerProfile.teamId, schema.team.id))
      .where(eq(schema.team.organizationId, corporate.organization.id));
    const created = await createBranch(corporate.cookie, corporate.organization.id, 'Pune');
    const source = (await created.json()) as { id: string };
    const [sourceProfile] = await db
      .select({ id: schema.designerProfile.id })
      .from(schema.designerProfile)
      .where(eq(schema.designerProfile.teamId, source.id));
    const customer = await makeUser({ email: 'branch-reviewer@example.com' });
    await db.insert(schema.review).values([
      { designerProfileId: target!.profileId, authorUserId: customer.id, rating: 5 },
      { designerProfileId: sourceProfile!.id, authorUserId: customer.id, rating: 4 },
    ]);

    const response = await removeBranch(corporate.cookie, source.id, target!.id);

    expect(response.status).toBe(409);
    expect(await db.select().from(schema.team).where(eq(schema.team.id, source.id))).toHaveLength(
      1,
    );
    expect(
      await db
        .select()
        .from(schema.review)
        .where(eq(schema.review.designerProfileId, sourceProfile!.id)),
    ).toHaveLength(1);
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

  it('returns frozen branch profile summaries to managers and assigned branches to members', async () => {
    const owner = await makeUser({ email: 'owner@example.com' });
    const member = await makeUser({ email: 'member@example.com' });
    const organization = await makeOrganization();
    await db.insert(schema.member).values([
      {
        id: 'owner-member',
        organizationId: organization.id,
        userId: owner.id,
        role: 'owner',
        createdAt: new Date(),
      },
      {
        id: 'regular-member',
        organizationId: organization.id,
        userId: member.id,
        role: 'member',
        createdAt: new Date(),
      },
    ]);
    const activeTeam = await makeTeam({ organizationId: organization.id, name: 'Mumbai' });
    const frozenTeam = await makeTeam({
      organizationId: organization.id,
      name: 'Pune',
      frozen: true,
      frozenAt: new Date('2026-09-01T00:00:00.000Z'),
      freezeRank: 1,
    });
    await makeDesigner({
      orgId: organization.id,
      teamId: activeTeam.id,
      slug: 'mumbai-studio',
    });
    const frozenProfile = await makeDesigner({
      orgId: organization.id,
      teamId: frozenTeam.id,
      slug: 'pune-studio',
      status: 'active',
      avgRating: '4.50',
      reviewCount: 8,
    });
    await db.insert(schema.teamMember).values({
      id: 'member-frozen-branch',
      teamId: frozenTeam.id,
      userId: member.id,
      createdAt: new Date(),
    });
    const city = await makeTaxonomy({ kind: 'city', slug: 'pune', label: 'Pune' });
    const scope = await makeTaxonomy({ kind: 'scope', slug: 'turnkey', label: 'Turnkey' });
    await db.insert(schema.designerProfileFootprint).values([
      { profileId: frozenProfile.id, taxonomyId: city.id },
      { profileId: frozenProfile.id, taxonomyId: scope.id },
    ]);

    const managerBranches = await orgsRepository.listBranchesForUser(
      owner.id,
      organization.id,
      true,
    );
    const memberBranches = await orgsRepository.listBranchesForUser(
      member.id,
      organization.id,
      false,
    );
    const footprint = await orgsRepository.listBranchFootprints([frozenProfile.id]);

    expect(managerBranches.map(({ name }) => name)).toEqual(['Mumbai', 'Pune']);
    expect(memberBranches).toHaveLength(1);
    expect(memberBranches[0]).toMatchObject({
      name: 'Pune',
      frozen: true,
      profileStatus: 'active',
      averageRating: '4.50',
      reviewCount: 8,
    });
    expect(footprint).toEqual([
      expect.objectContaining({
        profileId: frozenProfile.id,
        kind: 'city',
        slug: 'pune',
        label: 'Pune',
      }),
    ]);
  });
});
