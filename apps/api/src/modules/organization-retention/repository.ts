import { max } from 'drizzle-orm';
import { config } from '@repo/config';
import { and, db, eq, inArray, ne, schema, sql, type DB } from '@repo/db';
import { recordSearchProjectionEvents } from '../search-index/repository.js';

export type OrganizationRetentionRecord = typeof schema.organizationRetention.$inferSelect;
type Transaction = Parameters<Parameters<DB['transaction']>[0]>[0];

export type RetentionMutationResult =
  | { outcome: 'updated'; retention: OrganizationRetentionRecord | null }
  | { outcome: 'organization_not_found' }
  | { outcome: 'forbidden' }
  | { outcome: 'confirmation_mismatch' }
  | { outcome: 'not_recoverable' }
  | { outcome: 'legal_hold' };

const DAY_MS = 24 * 60 * 60 * 1_000;

function lifecycleDueDates(now: Date): { archiveDueAt: Date; hardDeleteDueAt: Date } {
  const archiveDueAt = new Date(now.getTime() + config.ORGANIZATION_DELIST_RETENTION_DAYS * DAY_MS);
  return {
    archiveDueAt,
    hardDeleteDueAt: new Date(
      archiveDueAt.getTime() + config.ORGANIZATION_ARCHIVE_RETENTION_DAYS * DAY_MS,
    ),
  };
}

async function lockOrganization(tx: Transaction, organizationId: string): Promise<void> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`organization-retention:${organizationId}`}, 0))`,
  );
}

async function organizationAccess(
  tx: Transaction,
  organizationId: string,
  userId: string,
): Promise<{ slug: string; owner: boolean } | null> {
  const [row] = await tx
    .select({
      slug: schema.organization.slug,
      role: schema.member.role,
      frozen: schema.member.frozen,
    })
    .from(schema.organization)
    .leftJoin(
      schema.member,
      and(
        eq(schema.member.organizationId, schema.organization.id),
        eq(schema.member.userId, userId),
      ),
    )
    .where(eq(schema.organization.id, organizationId))
    .for('update', { of: schema.organization })
    .limit(1);
  if (!row) return null;
  return { slug: row.slug, owner: row.role === 'owner' && row.frozen === false };
}

async function nextRevision(tx: Transaction, organizationId: string): Promise<number> {
  const [row] = await tx
    .select({ revision: max(schema.organizationRetentionEvent.revision) })
    .from(schema.organizationRetentionEvent)
    .where(eq(schema.organizationRetentionEvent.organizationId, organizationId));
  return (row?.revision ?? 0) + 1;
}

async function findRetentionForUpdate(
  tx: Transaction,
  organizationId: string,
): Promise<OrganizationRetentionRecord | null> {
  const [row] = await tx
    .select()
    .from(schema.organizationRetention)
    .where(eq(schema.organizationRetention.organizationId, organizationId))
    .limit(1)
    .for('update');
  return row ?? null;
}

async function captureAndDelist(
  tx: Transaction,
  input: {
    organizationId: string;
    userId: string;
    now: Date;
    revision: number;
  },
): Promise<void> {
  const profiles = await tx
    .select({ id: schema.designerProfile.id, status: schema.designerProfile.status })
    .from(schema.designerProfile)
    .where(eq(schema.designerProfile.orgId, input.organizationId))
    .for('update');
  const profileIds = profiles.map(({ id }) => id);
  const projects =
    profileIds.length === 0
      ? []
      : await tx
          .select({
            id: schema.project.id,
            status: schema.project.status,
            archiveReason: schema.project.archiveReason,
            publishedAt: schema.project.publishedAt,
            featuredAt: schema.project.featuredAt,
          })
          .from(schema.project)
          .where(
            and(
              inArray(schema.project.designerId, profileIds),
              ne(schema.project.status, 'deleted'),
            ),
          )
          .for('update');

  if (profiles.length > 0) {
    await tx.insert(schema.organizationRetentionProfileSnapshot).values(
      profiles.map((profile) => ({
        organizationId: input.organizationId,
        profileId: profile.id,
        originalStatus: profile.status,
        capturedAt: input.now,
      })),
    );
    await tx
      .update(schema.designerProfile)
      .set({ status: 'suspended', projectCount: 0, updatedAt: input.now })
      .where(inArray(schema.designerProfile.id, profileIds));
  }
  const publishedProjects = projects.filter(({ status }) => status === 'published');
  if (projects.length > 0) {
    await tx.insert(schema.organizationRetentionProjectSnapshot).values(
      projects.map((project) => ({
        organizationId: input.organizationId,
        projectId: project.id,
        originalStatus: project.status,
        originalArchiveReason: project.archiveReason,
        originalPublishedAt: project.publishedAt,
        originalFeaturedAt: project.featuredAt,
        capturedAt: input.now,
      })),
    );
    if (publishedProjects.length > 0) {
      await tx
        .update(schema.project)
        .set({ status: 'delisted', archiveReason: 'organization_retention', updatedAt: input.now })
        .where(
          inArray(
            schema.project.id,
            publishedProjects.map(({ id }) => id),
          ),
        );
      await tx.insert(schema.projectModerationEvent).values(
        publishedProjects.map((project) => ({
          projectId: project.id,
          actorUserId: input.userId,
          action: 'organization_delist' as const,
          fromStatus: project.status,
          toStatus: 'delisted' as const,
          reasonCode: 'organization_retention',
          createdAt: input.now,
        })),
      );
    }
  }

  await recordSearchProjectionEvents(tx, [
    ...profiles.map((profile) => ({
      entityKind: 'designer' as const,
      entityId: profile.id,
      operation: 'delete' as const,
      sourceUpdatedAt: input.now,
    })),
    ...publishedProjects.map((project) => ({
      entityKind: 'project' as const,
      entityId: project.id,
      operation: 'delete' as const,
      sourceUpdatedAt: input.now,
    })),
  ]);

  await tx.insert(schema.organizationRetentionEvent).values({
    organizationId: input.organizationId,
    revision: input.revision,
    type: 'deletion_requested',
    trigger: 'owner',
    actorUserId: input.userId,
    occurredAt: input.now,
  });
}

async function beginDeletion(
  tx: Transaction,
  input: { organizationId: string; userId: string; confirmationSlug: string; now: Date },
): Promise<RetentionMutationResult> {
  const access = await organizationAccess(tx, input.organizationId, input.userId);
  if (!access) return { outcome: 'organization_not_found' };
  if (!access.owner) return { outcome: 'forbidden' };
  if (access.slug !== input.confirmationSlug) return { outcome: 'confirmation_mismatch' };

  const existing = await findRetentionForUpdate(tx, input.organizationId);
  if (existing) {
    if (existing.status === 'deletion_requested') {
      return { outcome: 'updated', retention: existing };
    }
    return { outcome: 'not_recoverable' };
  }

  const revision = await nextRevision(tx, input.organizationId);
  const dueDates = lifecycleDueDates(input.now);
  const [retention] = await tx
    .insert(schema.organizationRetention)
    .values({
      organizationId: input.organizationId,
      status: 'deletion_requested',
      requestedByUserId: input.userId,
      requestedAt: input.now,
      ...dueDates,
      delistWindowDays: config.ORGANIZATION_DELIST_RETENTION_DAYS,
      archiveWindowDays: config.ORGANIZATION_ARCHIVE_RETENTION_DAYS,
      revision,
      createdAt: input.now,
      updatedAt: input.now,
    })
    .returning();
  const [subscription] = await tx
    .select({ razorpaySubscriptionId: schema.subscription.razorpaySubscriptionId })
    .from(schema.subscription)
    .where(eq(schema.subscription.organizationId, input.organizationId))
    .limit(1);
  if (subscription?.razorpaySubscriptionId) {
    const [manifest] = await tx
      .insert(schema.organizationPurgeManifest)
      .values({
        organizationId: input.organizationId,
        organizationSlug: access.slug,
        status: 'pending',
        trigger: 'owner',
        requestedByUserId: input.userId,
        createdAt: input.now,
        updatedAt: input.now,
      })
      .onConflictDoUpdate({
        target: schema.organizationPurgeManifest.organizationId,
        set: { updatedAt: input.now },
      })
      .returning({ id: schema.organizationPurgeManifest.id });
    await tx
      .insert(schema.organizationPurgeManifestItem)
      .values({
        manifestId: manifest!.id,
        kind: 'razorpay_subscription',
        resourceKey: subscription.razorpaySubscriptionId,
        createdAt: input.now,
        updatedAt: input.now,
      })
      .onConflictDoNothing();
  }
  await captureAndDelist(tx, { ...input, revision });
  return { outcome: 'updated', retention: retention! };
}

async function restoreSnapshots(
  tx: Transaction,
  input: {
    organizationId: string;
    actorUserId: string;
    now: Date;
    revision: number;
    trigger: 'owner' | 'superadmin';
  },
): Promise<void> {
  const [projectSnapshots, profileSnapshots] = await Promise.all([
    tx
      .select({
        projectId: schema.organizationRetentionProjectSnapshot.projectId,
        originalStatus: schema.organizationRetentionProjectSnapshot.originalStatus,
        currentStatus: schema.project.status,
      })
      .from(schema.organizationRetentionProjectSnapshot)
      .innerJoin(
        schema.project,
        eq(schema.project.id, schema.organizationRetentionProjectSnapshot.projectId),
      )
      .where(eq(schema.organizationRetentionProjectSnapshot.organizationId, input.organizationId)),
    tx
      .select()
      .from(schema.organizationRetentionProfileSnapshot)
      .where(eq(schema.organizationRetentionProfileSnapshot.organizationId, input.organizationId)),
  ]);

  await tx.execute(sql`
    update project as p
       set status = s.original_status,
           archive_reason = s.original_archive_reason,
           published_at = s.original_published_at,
           featured_at = s.original_featured_at,
           updated_at = ${input.now}
      from organization_retention_project_snapshot as s
     where s.organization_id = ${input.organizationId}
       and p.id = s.project_id
  `);
  await tx.execute(sql`
    update designer_profile as p
       set status = s.original_status,
           project_count = (
             select count(*)::int
               from project as restored_project
              where restored_project.designer_id = p.id
                and restored_project.status = 'published'
           ),
           updated_at = ${input.now}
      from organization_retention_profile_snapshot as s
     where s.organization_id = ${input.organizationId}
       and p.id = s.profile_id
  `);

  if (projectSnapshots.length > 0) {
    await tx.insert(schema.projectModerationEvent).values(
      projectSnapshots.map((project) => ({
        projectId: project.projectId,
        actorUserId: input.actorUserId,
        action: 'organization_restore' as const,
        fromStatus: project.currentStatus,
        toStatus: project.originalStatus,
        reasonCode: 'organization_retention',
        createdAt: input.now,
      })),
    );
  }

  await recordSearchProjectionEvents(tx, [
    ...profileSnapshots
      .filter(({ originalStatus }) => originalStatus === 'active')
      .map(({ profileId }) => ({
        entityKind: 'designer' as const,
        entityId: profileId,
        operation: 'index' as const,
        sourceUpdatedAt: input.now,
      })),
    ...projectSnapshots
      .filter(({ originalStatus }) => originalStatus === 'published')
      .map(({ projectId }) => ({
        entityKind: 'project' as const,
        entityId: projectId,
        operation: 'index' as const,
        sourceUpdatedAt: input.now,
      })),
  ]);

  await tx.insert(schema.organizationRetentionEvent).values({
    organizationId: input.organizationId,
    revision: input.revision,
    type: input.trigger === 'owner' ? 'deletion_cancelled' : 'restored',
    trigger: input.trigger,
    actorUserId: input.actorUserId,
    occurredAt: input.now,
  });
  await tx.execute(sql`
    delete from organization_purge_manifest_item as item
     using organization_purge_manifest as manifest
     where item.manifest_id = manifest.id
       and manifest.organization_id = ${input.organizationId}
       and item.kind = 'razorpay_subscription'
       and item.status in ('pending', 'failed')
  `);
  await tx
    .delete(schema.organizationRetention)
    .where(eq(schema.organizationRetention.organizationId, input.organizationId));
}

export const organizationRetentionRepository = {
  async findByOrganization(
    organizationId: string,
  ): Promise<OrganizationRetentionRecord | 'organization_not_found' | null> {
    const [organization] = await db
      .select({ id: schema.organization.id })
      .from(schema.organization)
      .where(eq(schema.organization.id, organizationId))
      .limit(1);
    if (!organization) return 'organization_not_found';
    const [retention] = await db
      .select()
      .from(schema.organizationRetention)
      .where(eq(schema.organizationRetention.organizationId, organizationId))
      .limit(1);
    return retention ?? null;
  },

  async findForOwner(input: {
    organizationId: string;
    userId: string;
  }): Promise<OrganizationRetentionRecord | 'organization_not_found' | 'forbidden' | null> {
    const [organization] = await db
      .select({
        id: schema.organization.id,
        role: schema.member.role,
        frozen: schema.member.frozen,
      })
      .from(schema.organization)
      .leftJoin(
        schema.member,
        and(
          eq(schema.member.organizationId, schema.organization.id),
          eq(schema.member.userId, input.userId),
        ),
      )
      .where(eq(schema.organization.id, input.organizationId))
      .limit(1);
    if (!organization) return 'organization_not_found';
    if (organization.role !== 'owner' || organization.frozen) return 'forbidden';
    const [retention] = await db
      .select()
      .from(schema.organizationRetention)
      .where(eq(schema.organizationRetention.organizationId, input.organizationId))
      .limit(1);
    return retention ?? null;
  },

  requestDeletion(input: {
    organizationId: string;
    userId: string;
    confirmationSlug: string;
    now: Date;
  }): Promise<RetentionMutationResult> {
    return db.transaction(async (tx) => {
      await lockOrganization(tx, input.organizationId);
      return beginDeletion(tx, input);
    });
  },

  restore(input: {
    organizationId: string;
    userId: string;
    allowArchived: boolean;
    now: Date;
  }): Promise<RetentionMutationResult> {
    return db.transaction(async (tx) => {
      await lockOrganization(tx, input.organizationId);
      const access = await organizationAccess(tx, input.organizationId, input.userId);
      if (!access) return { outcome: 'organization_not_found' };
      if (!input.allowArchived && !access.owner) return { outcome: 'forbidden' };
      const retention = await findRetentionForUpdate(tx, input.organizationId);
      if (!retention) return { outcome: 'not_recoverable' };
      const ownerCanRestore =
        retention.status === 'deletion_requested' && input.now < retention.archiveDueAt;
      const adminCanRestore =
        input.allowArchived &&
        (retention.status === 'deletion_requested' || retention.status === 'archived');
      if (!ownerCanRestore && !adminCanRestore) return { outcome: 'not_recoverable' };
      const revision = retention.revision + 1;
      await restoreSnapshots(tx, {
        organizationId: input.organizationId,
        actorUserId: input.userId,
        now: input.now,
        revision,
        trigger: input.allowArchived ? 'superadmin' : 'owner',
      });
      return { outcome: 'updated', retention: null };
    });
  },

  setLegalHold(input: {
    organizationId: string;
    actorUserId: string;
    hold: boolean;
    reason: string | null;
    now: Date;
  }): Promise<RetentionMutationResult> {
    return db.transaction(async (tx) => {
      await lockOrganization(tx, input.organizationId);
      const retention = await findRetentionForUpdate(tx, input.organizationId);
      if (!retention) return { outcome: 'organization_not_found' };
      if (retention.status === 'purging' || retention.status === 'erased') {
        return { outcome: 'not_recoverable' };
      }
      const revision = retention.revision + 1;
      const [updated] = await tx
        .update(schema.organizationRetention)
        .set({
          holdPlacedAt: input.hold ? input.now : null,
          holdPlacedByUserId: input.hold ? input.actorUserId : null,
          holdReason: input.hold ? input.reason : null,
          revision,
          updatedAt: input.now,
        })
        .where(eq(schema.organizationRetention.organizationId, input.organizationId))
        .returning();
      await tx.insert(schema.organizationRetentionEvent).values({
        organizationId: input.organizationId,
        revision,
        type: input.hold ? 'hold_placed' : 'hold_released',
        trigger: 'superadmin',
        actorUserId: input.actorUserId,
        details: input.hold ? { reason: input.reason } : {},
        occurredAt: input.now,
      });
      return { outcome: 'updated', retention: updated! };
    });
  },

  requestPermanentErasure(input: {
    organizationId: string;
    userId: string;
    confirmationSlug: string;
    now: Date;
  }): Promise<RetentionMutationResult> {
    return db.transaction(async (tx) => {
      await lockOrganization(tx, input.organizationId);
      let result = await beginDeletion(tx, input);
      if (result.outcome !== 'updated' || !result.retention) return result;
      let retention = result.retention;
      if (retention.holdPlacedAt) return { outcome: 'legal_hold' };
      if (retention.status === 'purging' || retention.status === 'erased') {
        return { outcome: 'not_recoverable' };
      }
      if (retention.status === 'purge_pending') return result;
      const revision = retention.revision + 1;
      const [updated] = await tx
        .update(schema.organizationRetention)
        .set({
          status: 'purge_pending',
          purgeRequestedAt: input.now,
          revision,
          updatedAt: input.now,
        })
        .where(eq(schema.organizationRetention.organizationId, input.organizationId))
        .returning();
      await tx.insert(schema.organizationRetentionEvent).values({
        organizationId: input.organizationId,
        revision,
        type: 'purge_requested',
        trigger: 'owner',
        actorUserId: input.userId,
        occurredAt: input.now,
      });
      retention = updated!;
      result = { outcome: 'updated', retention };
      return result;
    });
  },
};
