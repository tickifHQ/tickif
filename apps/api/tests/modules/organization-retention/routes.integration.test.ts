import { describe, expect, it } from 'vitest';
import { and, db, eq, schema } from '@repo/db';
import { makeOrganization } from '@repo/db/testing';
import { app } from '../../../src/app.js';
import { organizationRetentionRepository } from '../../../src/modules/organization-retention/repository.js';
import {
  ProjectSlugUnavailableError,
  projectsRepository,
} from '../../../src/modules/projects/repository.js';
import {
  orgsRepository,
  OWNERSHIP_TRANSFER_RESULT,
} from '../../../src/modules/orgs/repository.js';
import { activateOrganization, createRoleSession } from '../../helpers/auth.js';

async function organizationSession(input: {
  phone: string;
  role: 'owner' | 'member';
  organizationId: string;
}) {
  const session = await createRoleSession(input.phone, 'designer');
  await db.insert(schema.member).values({
    id: `retention-member-${session.userId}`,
    organizationId: input.organizationId,
    userId: session.userId,
    role: input.role,
    createdAt: new Date(),
  });
  return {
    ...session,
    cookie: await activateOrganization(session.cookie, input.organizationId),
  };
}

function request(path: string, cookie: string, method: 'GET' | 'POST' | 'DELETE', body?: unknown) {
  return app.request(path, {
    method,
    headers: {
      cookie,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function seedPublishedOrganization() {
  const organization = await makeOrganization({ slug: 'retention-studio' });
  const owner = await organizationSession({
    phone: '+919800025001',
    role: 'owner',
    organizationId: organization.id,
  });
  const teamId = `retention-team-${organization.id}`;
  await db.insert(schema.team).values({
    id: teamId,
    organizationId: organization.id,
    name: 'Main Branch',
  });
  await db.insert(schema.teamMember).values({
    id: `retention-team-member-${owner.userId}`,
    teamId,
    userId: owner.userId,
  });
  const [profile] = await db
    .insert(schema.designerProfile)
    .values({
      orgId: organization.id,
      teamId,
      userId: owner.userId,
      displayName: 'Retention Studio',
      slug: 'retention-studio-profile',
      status: 'active',
      projectCount: 1,
    })
    .returning();
  const publishedAt = new Date('2026-08-15T08:00:00.000Z');
  const featuredAt = new Date('2026-08-20T08:00:00.000Z');
  const [project] = await db
    .insert(schema.project)
    .values({
      designerId: profile!.id,
      title: 'Retained Home',
      slug: 'retained-home',
      status: 'published',
      publishedAt,
      featuredAt,
    })
    .returning();
  await db.insert(schema.projectImage).values({
    projectId: project!.id,
    originalKey: `originals/${project!.id}/retained.jpg`,
    contentType: 'image/jpeg',
    status: 'ready',
  });
  return { organization, owner, profile: profile!, project: project!, publishedAt, featuredAt };
}

describe('organization retention routes', () => {
  it('keeps private projects private while retaining their exact state', async () => {
    const seeded = await seedPublishedOrganization();
    const [draft] = await db
      .insert(schema.project)
      .values({
        designerId: seeded.profile.id,
        title: 'Private Client Home',
        slug: 'private-client-home',
        status: 'draft',
      })
      .returning();

    const deletion = await request('/api/orgs/retention/deletion', seeded.owner.cookie, 'POST', {
      confirmationSlug: seeded.organization.slug,
    });

    expect(deletion.status).toBe(200);
    const [retainedDraft] = await db
      .select()
      .from(schema.project)
      .where(eq(schema.project.id, draft!.id));
    expect(retainedDraft).toMatchObject({ status: 'draft', archiveReason: null });
    expect((await app.request(`/api/projects/public/${draft!.id}`)).status).toBe(404);
    expect((await app.request(`/api/projects/slug/${draft!.slug}`)).status).toBe(404);

    const upload = await request('/api/media/upload-url', seeded.owner.cookie, 'POST', {
      projectId: draft!.id,
      contentType: 'image/jpeg',
      size: 1_024,
    });
    expect(upload.status).toBe(409);
    const images = await db
      .select({ id: schema.projectImage.id })
      .from(schema.projectImage)
      .where(eq(schema.projectImage.projectId, draft!.id));
    expect(images).toEqual([]);
  });

  it('durably records paid subscription cancellation before freezing the organization', async () => {
    const seeded = await seedPublishedOrganization();
    await db.insert(schema.subscription).values({
      organizationId: seeded.organization.id,
      planTier: 'professional_plus',
      subscriptionState: 'active',
      razorpaySubscriptionId: 'sub_retention_cleanup',
      razorpayStatus: 'active',
    });

    const deletion = await request('/api/orgs/retention/deletion', seeded.owner.cookie, 'POST', {
      confirmationSlug: seeded.organization.slug,
    });

    expect(deletion.status).toBe(200);
    const [cleanup] = await db
      .select({
        kind: schema.organizationPurgeManifestItem.kind,
        resourceKey: schema.organizationPurgeManifestItem.resourceKey,
        status: schema.organizationPurgeManifestItem.status,
      })
      .from(schema.organizationPurgeManifestItem)
      .innerJoin(
        schema.organizationPurgeManifest,
        eq(schema.organizationPurgeManifest.id, schema.organizationPurgeManifestItem.manifestId),
      )
      .where(eq(schema.organizationPurgeManifest.organizationId, seeded.organization.id));
    expect(cleanup).toEqual({
      kind: 'razorpay_subscription',
      resourceKey: 'sub_retention_cleanup',
      status: 'pending',
    });
  });

  it('rejects ownership acceptance after permanent erasure wins the organization lock', async () => {
    const seeded = await seedPublishedOrganization();
    const target = await organizationSession({
      phone: '+919800025099',
      role: 'member',
      organizationId: seeded.organization.id,
    });
    const [targetMember] = await db
      .select()
      .from(schema.member)
      .where(
        and(
          eq(schema.member.organizationId, seeded.organization.id),
          eq(schema.member.userId, target.userId),
        ),
      );
    const [transfer] = await db
      .insert(schema.ownershipTransferRequest)
      .values({
        organizationId: seeded.organization.id,
        initiatorUserId: seeded.owner.userId,
        targetUserId: target.userId,
        targetMemberId: targetMember!.id,
        expiresAt: new Date('2026-09-20T00:00:00.000Z'),
      })
      .returning();
    await organizationRetentionRepository.requestPermanentErasure({
      organizationId: seeded.organization.id,
      userId: seeded.owner.userId,
      confirmationSlug: seeded.organization.slug,
      now: new Date('2026-09-04T12:00:00.000Z'),
    });

    const result = await orgsRepository.resolveOwnershipTransfer({
      id: transfer!.id,
      actorUserId: target.userId,
      action: 'accept',
      now: new Date('2026-09-04T12:01:00.000Z'),
    });

    expect(result).toBe(OWNERSHIP_TRANSFER_RESULT.RETENTION_ACTIVE);
  });

  it('delists without deleting data and restores the exact public state', async () => {
    const seeded = await seedPublishedOrganization();

    const deletion = await request('/api/orgs/retention/deletion', seeded.owner.cookie, 'POST', {
      confirmationSlug: seeded.organization.slug,
    });
    expect(deletion.status).toBe(200);
    expect(await deletion.json()).toMatchObject({
      retention: {
        organizationId: seeded.organization.id,
        status: 'deletion_requested',
        delistWindowDays: 90,
        archiveWindowDays: 365,
      },
    });

    const [delisted, suspended, image, projectSnapshot, profileSnapshot] = await Promise.all([
      db
        .select()
        .from(schema.project)
        .where(eq(schema.project.id, seeded.project.id))
        .then((r) => r[0]),
      db
        .select()
        .from(schema.designerProfile)
        .where(eq(schema.designerProfile.id, seeded.profile.id))
        .then((r) => r[0]),
      db
        .select()
        .from(schema.projectImage)
        .where(eq(schema.projectImage.projectId, seeded.project.id))
        .then((r) => r[0]),
      db
        .select()
        .from(schema.organizationRetentionProjectSnapshot)
        .where(eq(schema.organizationRetentionProjectSnapshot.projectId, seeded.project.id))
        .then((r) => r[0]),
      db
        .select()
        .from(schema.organizationRetentionProfileSnapshot)
        .where(eq(schema.organizationRetentionProfileSnapshot.profileId, seeded.profile.id))
        .then((r) => r[0]),
    ]);
    expect(delisted).toMatchObject({ status: 'delisted', archiveReason: 'organization_retention' });
    expect(suspended).toMatchObject({ status: 'suspended', projectCount: 0 });
    expect(image?.originalKey).toBe(`originals/${seeded.project.id}/retained.jpg`);
    expect(projectSnapshot).toMatchObject({
      originalStatus: 'published',
      originalPublishedAt: seeded.publishedAt,
      originalFeaturedAt: seeded.featuredAt,
    });
    expect(profileSnapshot?.originalStatus).toBe('active');
    const retainedById = await app.request(`/api/projects/public/${seeded.project.id}`);
    expect(retainedById.status).toBe(200);
    expect(retainedById.headers.get('x-robots-tag')).toBe('noindex');
    expect(await retainedById.json()).toMatchObject({ availability: 'unavailable' });
    const retainedBySlug = await app.request(`/api/projects/slug/${seeded.project.slug}`);
    expect(retainedBySlug.status).toBe(200);
    expect(retainedBySlug.headers.get('x-robots-tag')).toBe('noindex');
    expect(await retainedBySlug.json()).toMatchObject({ availability: 'unavailable' });
    const deleteEvents = await db
      .select()
      .from(schema.searchProjectionOutbox)
      .where(eq(schema.searchProjectionOutbox.operation, 'delete'));
    expect(deleteEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entityKind: 'project', entityId: seeded.project.id }),
        expect.objectContaining({ entityKind: 'designer', entityId: seeded.profile.id }),
      ]),
    );
    const [delistAudit] = await db
      .select()
      .from(schema.projectModerationEvent)
      .where(eq(schema.projectModerationEvent.projectId, seeded.project.id));
    expect(delistAudit).toMatchObject({
      action: 'organization_delist',
      fromStatus: 'published',
      toStatus: 'delisted',
    });

    const blockedAuthMutation = await request(
      '/api/auth/organization/update',
      seeded.owner.cookie,
      'POST',
      { organizationId: seeded.organization.id, data: { name: 'Changed While Retained' } },
    );
    expect(blockedAuthMutation.status).toBe(403);

    const restore = await request('/api/orgs/retention/restore', seeded.owner.cookie, 'POST');
    expect(restore.status).toBe(200);
    expect(await restore.json()).toEqual({ retention: null });

    const [restoredProject] = await db
      .select()
      .from(schema.project)
      .where(eq(schema.project.id, seeded.project.id));
    const [restoredProfile] = await db
      .select()
      .from(schema.designerProfile)
      .where(eq(schema.designerProfile.id, seeded.profile.id));
    expect(restoredProject).toMatchObject({
      status: 'published',
      archiveReason: null,
      publishedAt: seeded.publishedAt,
      featuredAt: seeded.featuredAt,
    });
    expect(restoredProfile).toMatchObject({ status: 'active', projectCount: 1 });
    const moderationHistory = await db
      .select()
      .from(schema.projectModerationEvent)
      .where(eq(schema.projectModerationEvent.projectId, seeded.project.id));
    expect(moderationHistory).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'organization_restore',
          fromStatus: 'delisted',
          toStatus: 'published',
        }),
      ]),
    );
    const [retention] = await db
      .select()
      .from(schema.organizationRetention)
      .where(eq(schema.organizationRetention.organizationId, seeded.organization.id));
    expect(retention).toBeUndefined();
  });

  it('enforces owner and superadmin boundaries, including legal holds', async () => {
    const seeded = await seedPublishedOrganization();
    const member = await organizationSession({
      phone: '+919800025002',
      role: 'member',
      organizationId: seeded.organization.id,
    });
    const denied = await request('/api/orgs/retention/deletion', member.cookie, 'POST', {
      confirmationSlug: seeded.organization.slug,
    });
    expect(denied.status).toBe(403);

    const deletion = await request('/api/orgs/retention/deletion', seeded.owner.cookie, 'POST', {
      confirmationSlug: seeded.organization.slug,
    });
    expect(deletion.status).toBe(200);
    const superadmin = await createRoleSession('+919800025003', 'superadmin');
    const hold = await request(
      `/api/admin/organizations/${seeded.organization.id}/retention/hold`,
      superadmin.cookie,
      'POST',
      { reason: 'Open legal dispute' },
    );
    expect(hold.status).toBe(200);

    const eraseWhileHeld = await request(
      '/api/orgs/retention/permanent-erasure',
      seeded.owner.cookie,
      'POST',
      { confirmation: 'PERMANENTLY DELETE', confirmationSlug: seeded.organization.slug },
    );
    expect(eraseWhileHeld.status).toBe(409);

    const release = await request(
      `/api/admin/organizations/${seeded.organization.id}/retention/hold`,
      superadmin.cookie,
      'DELETE',
    );
    expect(release.status).toBe(200);
    const erase = await request(
      '/api/orgs/retention/permanent-erasure',
      seeded.owner.cookie,
      'POST',
      { confirmation: 'PERMANENTLY DELETE', confirmationSlug: seeded.organization.slug },
    );
    expect(erase.status).toBe(202);
    const [pending] = await db
      .select()
      .from(schema.organizationRetention)
      .where(
        and(
          eq(schema.organizationRetention.organizationId, seeded.organization.id),
          eq(schema.organizationRetention.status, 'purge_pending'),
        ),
      );
    expect(pending).toBeDefined();
  });

  it('allows only a superadmin to recover an archived organization', async () => {
    const seeded = await seedPublishedOrganization();
    await request('/api/orgs/retention/deletion', seeded.owner.cookie, 'POST', {
      confirmationSlug: seeded.organization.slug,
    });
    await db
      .update(schema.organizationRetention)
      .set({ status: 'archived', archivedAt: new Date('2026-12-03T00:00:00.000Z') })
      .where(eq(schema.organizationRetention.organizationId, seeded.organization.id));

    const ownerRestore = await request('/api/orgs/retention/restore', seeded.owner.cookie, 'POST');
    expect(ownerRestore.status).toBe(409);

    const superadmin = await createRoleSession('+919800025004', 'superadmin');
    const status = await request(
      `/api/admin/organizations/${seeded.organization.id}/retention`,
      superadmin.cookie,
      'GET',
    );
    expect(status.status).toBe(200);
    expect(await status.json()).toMatchObject({ retention: { status: 'archived' } });
    const restored = await request(
      `/api/admin/organizations/${seeded.organization.id}/retention/restore`,
      superadmin.cookie,
      'POST',
    );
    expect(restored.status).toBe(200);
    expect(await restored.json()).toEqual({ retention: null });
  });

  it('closes the owner recovery window exactly at archiveDueAt', async () => {
    const seeded = await seedPublishedOrganization();
    await request('/api/orgs/retention/deletion', seeded.owner.cookie, 'POST', {
      confirmationSlug: seeded.organization.slug,
    });
    const [retention] = await db
      .select()
      .from(schema.organizationRetention)
      .where(eq(schema.organizationRetention.organizationId, seeded.organization.id));

    await expect(
      organizationRetentionRepository.restore({
        organizationId: seeded.organization.id,
        userId: seeded.owner.userId,
        allowArchived: false,
        now: retention!.archiveDueAt,
      }),
    ).resolves.toEqual({ outcome: 'not_recoverable' });
  });

  it('returns 410 for durable id and slug tombstones after purge', async () => {
    const projectId = '11111111-1111-4111-8111-111111111111';
    await db.insert(schema.projectTombstone).values({
      projectId,
      projectSlug: 'purged-home',
      organizationId: 'purged-org',
      purgedAt: new Date('2026-09-03T12:00:00.000Z'),
    });

    const [byId, bySlug] = await Promise.all([
      app.request(`/api/projects/public/${projectId}`),
      app.request('/api/projects/slug/purged-home'),
    ]);
    expect(byId.status).toBe(410);
    expect(bySlug.status).toBe(410);
  });

  it('reserves a purged slug against later project creation', async () => {
    const seeded = await seedPublishedOrganization();
    await db.insert(schema.projectTombstone).values({
      projectId: '22222222-2222-4222-8222-222222222222',
      projectSlug: 'never-reuse-this-home',
      organizationId: 'purged-org',
      purgedAt: new Date('2026-09-04T12:00:00.000Z'),
    });

    await expect(
      projectsRepository.createDraft(
        { title: 'Never Reuse This Home' },
        seeded.profile.id,
        'never-reuse-this-home',
      ),
    ).rejects.toBeInstanceOf(ProjectSlugUnavailableError);
  });
});
