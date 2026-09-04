import { describe, expect, it, vi } from 'vitest';
import { config } from '@repo/config';
import { db, eq, schema } from '@repo/db';
import { makeOrganization, makeTeam } from '@repo/db/testing';
import {
  findPendingProviderCleanup,
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
    expect(await findPendingProviderCleanup(10)).toEqual([
      expect.objectContaining({ sequence: item!.sequence }),
    ]);
    await db
      .delete(schema.organizationRetention)
      .where(eq(schema.organizationRetention.organizationId, seeded.organization.id));
    const cancel = vi.fn(async () => undefined);

    expect(await findPendingProviderCleanup(10)).toEqual([]);
    await expect(
      runProviderCleanup(
        {
          sequence: item!.sequence,
          organizationId: seeded.organization.id,
          razorpaySubscriptionId: 'sub_restored',
        },
        now,
        cancel,
      ),
    ).resolves.toBe(false);
    expect(cancel).not.toHaveBeenCalled();
  });
});
