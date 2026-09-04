import { describe, expect, it, vi } from 'vitest';
import { config } from '@repo/config';
import { db, eq, schema } from '@repo/db';
import { makeOrganization, makeSubscription, makeTeam } from '@repo/db/testing';
import {
  claimPendingProviderCleanup,
  markProviderCleanupAttemptFailed,
  prepareOrganizationPurge,
  runProviderCleanup,
} from '../../src/organization-retention/repository.js';

async function seedPurgingOrganization(now: Date) {
  const organization = await makeOrganization({ slug: `lease-org-${now.getTime()}` });
  const team = await makeTeam({ organizationId: organization.id });
  const [profile] = await db
    .insert(schema.designerProfile)
    .values({
      orgId: organization.id,
      teamId: team.id,
      displayName: 'Lease Studio',
      slug: `lease-profile-${now.getTime()}`,
      status: 'suspended',
    })
    .returning();
  const [project] = await db
    .insert(schema.project)
    .values({
      designerId: profile!.id,
      title: 'Lease Project',
      slug: `lease-project-${now.getTime()}`,
      status: 'draft',
    })
    .returning();
  await db.insert(schema.organizationRetention).values({
    organizationId: organization.id,
    status: 'purge_pending',
    requestedByUserId: 'retention-owner',
    requestedAt: now,
    archiveDueAt: new Date(now.getTime() + 86_400_000),
    hardDeleteDueAt: new Date(now.getTime() + 172_800_000),
    delistWindowDays: 1,
    archiveWindowDays: 1,
    purgeRequestedAt: now,
  });
  return { organization, profile: profile!, project: project! };
}

describe('organization purge fencing', () => {
  it('waits for the latest project, logo, or verification upload plus settling time', async () => {
    const now = new Date('2026-09-04T12:00:00.000Z');
    const seeded = await seedPurgingOrganization(now);
    const latestExpiry = new Date(now.getTime() + 20_000);
    await db.insert(schema.organizationUploadLease).values([
      {
        organizationId: seeded.organization.id,
        resourceKey: `originals/${seeded.project.id}/late-project`,
        expiresAt: new Date(now.getTime() + 10_000),
      },
      {
        organizationId: seeded.organization.id,
        resourceKey: `originals/logos/${seeded.profile.id}/late-logo`,
        expiresAt: latestExpiry,
      },
      {
        organizationId: seeded.organization.id,
        resourceKey: `verification-documents/${seeded.organization.id}/late-document`,
        expiresAt: new Date(now.getTime() + 15_000),
      },
    ]);

    const prepared = await prepareOrganizationPurge(seeded.organization.id, now);

    expect(prepared?.storageScanNotBefore).toEqual(
      new Date(latestExpiry.getTime() + config.ORGANIZATION_UPLOAD_SETTLE_SECONDS * 1_000),
    );
    expect(prepared?.projectIds).toContain(seeded.project.id);
    expect(prepared?.profileIds).toContain(seeded.profile.id);
  });

  it('does not expose or execute provider cleanup after retention is restored', async () => {
    const now = new Date('2026-09-04T13:00:00.000Z');
    const seeded = await seedPurgingOrganization(now);
    const [manifest] = await db
      .insert(schema.organizationPurgeManifest)
      .values({
        organizationId: seeded.organization.id,
        organizationSlug: seeded.organization.slug,
        trigger: 'owner',
        status: 'pending',
      })
      .returning();
    const [item] = await db
      .insert(schema.organizationPurgeManifestItem)
      .values({
        manifestId: manifest!.id,
        kind: 'razorpay_subscription',
        resourceKey: 'sub_restored',
      })
      .returning();
    const [claimed] = await claimPendingProviderCleanup(now, 10);
    expect(claimed).toEqual(
      expect.objectContaining({ sequence: item!.sequence }),
    );
    await db
      .delete(schema.organizationRetention)
      .where(eq(schema.organizationRetention.organizationId, seeded.organization.id));
    const cancel = vi.fn(async () => undefined);

    expect(await claimPendingProviderCleanup(now, 10)).toEqual([]);
    await expect(
      runProviderCleanup(
        claimed!,
        now,
        cancel,
      ),
    ).resolves.toBe(false);
    expect(cancel).not.toHaveBeenCalled();
  });

  it('allows only one worker to claim the same provider cleanup item', async () => {
    const now = new Date('2026-09-04T14:00:00.000Z');
    const seeded = await seedPurgingOrganization(now);
    const [manifest] = await db
      .insert(schema.organizationPurgeManifest)
      .values({
        organizationId: seeded.organization.id,
        organizationSlug: seeded.organization.slug,
        trigger: 'owner',
        status: 'pending',
      })
      .returning();
    await db.insert(schema.organizationPurgeManifestItem).values({
      manifestId: manifest!.id,
      kind: 'razorpay_subscription',
      resourceKey: 'sub_concurrent',
    });

    const claims = (
      await Promise.all([
        claimPendingProviderCleanup(now, 10),
        claimPendingProviderCleanup(now, 10),
      ])
    ).flat();

    expect(claims).toHaveLength(1);
    const [stored] = await db
      .select({
        status: schema.organizationPurgeManifestItem.status,
        attemptCount: schema.organizationPurgeManifestItem.attemptCount,
        claimToken: schema.organizationPurgeManifestItem.claimToken,
      })
      .from(schema.organizationPurgeManifestItem)
      .where(eq(schema.organizationPurgeManifestItem.manifestId, manifest!.id));
    expect(stored).toMatchObject({
      status: 'processing',
      attemptCount: 1,
      claimToken: claims[0]!.claimToken,
    });
  });

  it('reconciles an ambiguous cancellation after the durable claim expires', async () => {
    const now = new Date('2026-09-04T15:00:00.000Z');
    const seeded = await seedPurgingOrganization(now);
    await makeSubscription({
      organizationId: seeded.organization.id,
      planTier: 'corporate',
      razorpaySubscriptionId: 'sub_ambiguous',
      razorpayStatus: 'active',
    });
    const [manifest] = await db
      .insert(schema.organizationPurgeManifest)
      .values({
        organizationId: seeded.organization.id,
        organizationSlug: seeded.organization.slug,
        trigger: 'owner',
        status: 'pending',
      })
      .returning();
    await db.insert(schema.organizationPurgeManifestItem).values({
      manifestId: manifest!.id,
      kind: 'razorpay_subscription',
      resourceKey: 'sub_ambiguous',
    });
    const [firstClaim] = await claimPendingProviderCleanup(now, 10);
    const ambiguousCancel = vi.fn(async () => {
      throw new Error('response lost after provider accepted cancellation');
    });

    await expect(runProviderCleanup(firstClaim!, now, ambiguousCancel)).rejects.toThrow(
      'response lost',
    );
    await markProviderCleanupAttemptFailed(firstClaim!, 'Error', now);
    expect(await claimPendingProviderCleanup(new Date(now.getTime() + 14 * 60_000), 10)).toEqual(
      [],
    );

    const retryAt = new Date(now.getTime() + 16 * 60_000);
    const [retryClaim] = await claimPendingProviderCleanup(retryAt, 10);
    expect(retryClaim?.claimToken).not.toBe(firstClaim?.claimToken);
    await expect(
      runProviderCleanup(retryClaim!, retryAt, vi.fn(async () => undefined)),
    ).resolves.toBe(true);

    const [subscription] = await db
      .select()
      .from(schema.subscription)
      .where(eq(schema.subscription.organizationId, seeded.organization.id));
    const [item] = await db
      .select()
      .from(schema.organizationPurgeManifestItem)
      .where(eq(schema.organizationPurgeManifestItem.manifestId, manifest!.id));
    expect(subscription).toMatchObject({
      planTier: 'hobby',
      subscriptionState: 'active',
      razorpaySubscriptionId: null,
      razorpayStatus: 'cancelled',
    });
    expect(item).toMatchObject({ status: 'deleted', claimToken: null, claimedAt: null });
  });
});
