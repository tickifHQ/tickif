import {
  and,
  asc,
  db,
  eq,
  inArray,
  isNull,
  lte,
  max,
  or,
  schema,
  sql,
  type DB,
} from '@repo/db';
import { config } from '@repo/config';

type Transaction = Parameters<Parameters<DB['transaction']>[0]>[0];

export type RetentionCandidate = { organizationId: string };

export type PurgeManifestItem = {
  sequence: bigint;
  resourceKey: string;
};

export type ProviderCleanupItem = {
  sequence: bigint;
  organizationId: string;
  razorpaySubscriptionId: string;
};

export type PreparedOrganizationPurge = {
  manifestId: string;
  organizationId: string;
  projectIds: string[];
  profileIds: string[];
  items: PurgeManifestItem[];
  storageScanNotBefore: Date | null;
};

async function lockOrganization(tx: Transaction, organizationId: string): Promise<void> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`organization-retention:${organizationId}`}, 0))`,
  );
}

export async function findOrganizationsDueForArchive(
  now: Date,
  limit: number,
): Promise<RetentionCandidate[]> {
  return db
    .select({ organizationId: schema.organizationRetention.organizationId })
    .from(schema.organizationRetention)
    .where(
      and(
        eq(schema.organizationRetention.status, 'deletion_requested'),
        isNull(schema.organizationRetention.holdPlacedAt),
        lte(schema.organizationRetention.archiveDueAt, now),
      ),
    )
    .orderBy(
      asc(schema.organizationRetention.archiveDueAt),
      asc(schema.organizationRetention.organizationId),
    )
    .limit(limit);
}

/** Move a due organization into the archive tier without changing its saved resource state. */
export async function archiveOrganization(organizationId: string, now: Date): Promise<boolean> {
  return db.transaction(async (tx) => {
    await lockOrganization(tx, organizationId);
    const [retention] = await tx
      .select()
      .from(schema.organizationRetention)
      .where(eq(schema.organizationRetention.organizationId, organizationId))
      .for('update')
      .limit(1);
    if (
      !retention ||
      retention.status !== 'deletion_requested' ||
      retention.holdPlacedAt !== null ||
      retention.archiveDueAt > now
    ) {
      return false;
    }

    const snapshots = await tx
      .select({ projectId: schema.organizationRetentionProjectSnapshot.projectId })
      .from(schema.organizationRetentionProjectSnapshot)
      .where(eq(schema.organizationRetentionProjectSnapshot.organizationId, organizationId));
    const projectIds = snapshots.map(({ projectId }) => projectId);
    const projects =
      projectIds.length === 0
        ? []
        : await tx
            .select({ id: schema.project.id })
            .from(schema.project)
            .where(
              and(
                inArray(schema.project.id, projectIds),
                eq(schema.project.status, 'delisted'),
              ),
            )
            .for('update');
    if (projects.length > 0) {
      const archivedProjectIds = projects.map(({ id }) => id);
      await tx
        .update(schema.project)
        .set({
          status: 'archived',
          archiveReason: 'organization_retention',
          updatedAt: now,
        })
        .where(inArray(schema.project.id, archivedProjectIds));
      await tx.insert(schema.projectModerationEvent).values(
        archivedProjectIds.map((projectId) => ({
          projectId,
          action: 'organization_archive' as const,
          fromStatus: 'delisted' as const,
          toStatus: 'archived' as const,
          reasonCode: 'organization_retention',
          createdAt: now,
        })),
      );
      await tx.insert(schema.searchProjectionOutbox).values(
        archivedProjectIds.map((entityId) => ({
          entityKind: 'project' as const,
          entityId,
          operation: 'delete' as const,
          sourceUpdatedAt: now,
        })),
      );
    }

    const revision = retention.revision + 1;
    await tx
      .update(schema.organizationRetention)
      .set({ status: 'archived', archivedAt: now, revision, updatedAt: now })
      .where(eq(schema.organizationRetention.organizationId, organizationId));
    await tx.insert(schema.organizationRetentionEvent).values({
      organizationId,
      revision,
      type: 'archived',
      trigger: 'retention_schedule',
      occurredAt: now,
    });
    return true;
  });
}

/**
 * Duplication may intentionally share immutable object keys. Never remove bytes
 * while another organization still references the same original, derivative,
 * profile logo, or verification document.
 */
export async function isStorageKeyReferencedOutsideOrganization(
  resourceKey: string,
  organizationId: string,
): Promise<boolean> {
  const result = await db.execute<{ referenced: boolean }>(sql`
    select exists (
      select 1
        from project_image as image
        join project on project.id = image.project_id
        join designer_profile as profile on profile.id = project.designer_id
       where profile.org_id <> ${organizationId}
         and (
           image.original_key = ${resourceKey}
           or exists (
             select 1
               from jsonb_array_elements(image.derivatives) as derivative
              where derivative->>'key' = ${resourceKey}
           )
         )
      union all
      select 1
        from designer_profile as profile
       where profile.org_id <> ${organizationId}
         and profile.logo_image_id = ${resourceKey}
      union all
      select 1
        from verification_document_version as version
        join verification_document_slot as slot on slot.id = version.slot_id
        join verification_application as application on application.id = slot.application_id
       where application.organization_id <> ${organizationId}
         and version.object_key = ${resourceKey}
    ) as referenced
  `);
  return result.rows[0]?.referenced === true;
}

export async function findOrganizationsDueForPurge(
  now: Date,
  limit: number,
): Promise<RetentionCandidate[]> {
  return db
    .select({ organizationId: schema.organizationRetention.organizationId })
    .from(schema.organizationRetention)
    .where(
      and(
        isNull(schema.organizationRetention.holdPlacedAt),
        or(
          eq(schema.organizationRetention.status, 'purge_pending'),
          eq(schema.organizationRetention.status, 'purging'),
          and(
            eq(schema.organizationRetention.status, 'archived'),
            lte(schema.organizationRetention.hardDeleteDueAt, now),
          ),
        ),
      ),
    )
    .orderBy(
      asc(schema.organizationRetention.hardDeleteDueAt),
      asc(schema.organizationRetention.organizationId),
    )
    .limit(limit);
}

export async function findPendingProviderCleanup(limit: number): Promise<ProviderCleanupItem[]> {
  return db
    .select({
      sequence: schema.organizationPurgeManifestItem.sequence,
      organizationId: schema.organizationPurgeManifest.organizationId,
      razorpaySubscriptionId: schema.organizationPurgeManifestItem.resourceKey,
    })
    .from(schema.organizationPurgeManifestItem)
    .innerJoin(
      schema.organizationPurgeManifest,
      eq(schema.organizationPurgeManifest.id, schema.organizationPurgeManifestItem.manifestId),
    )
    .innerJoin(
      schema.organizationRetention,
      eq(
        schema.organizationRetention.organizationId,
        schema.organizationPurgeManifest.organizationId,
      ),
    )
    .where(
      and(
        eq(schema.organizationPurgeManifestItem.kind, 'razorpay_subscription'),
        or(
          eq(schema.organizationPurgeManifestItem.status, 'pending'),
          eq(schema.organizationPurgeManifestItem.status, 'failed'),
        ),
      ),
    )
    .orderBy(asc(schema.organizationPurgeManifestItem.sequence))
    .limit(limit);
}

export async function runProviderCleanup(
  item: ProviderCleanupItem,
  now: Date,
  cancel: (razorpaySubscriptionId: string) => Promise<void>,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock_shared(hashtextextended(${`organization-retention:${item.organizationId}`}, 0))`,
    );
    const [active] = await tx
      .select({ sequence: schema.organizationPurgeManifestItem.sequence })
      .from(schema.organizationPurgeManifestItem)
      .innerJoin(
        schema.organizationPurgeManifest,
        eq(schema.organizationPurgeManifest.id, schema.organizationPurgeManifestItem.manifestId),
      )
      .innerJoin(
        schema.organizationRetention,
        eq(
          schema.organizationRetention.organizationId,
          schema.organizationPurgeManifest.organizationId,
        ),
      )
      .where(
        and(
          eq(schema.organizationPurgeManifestItem.sequence, item.sequence),
          eq(schema.organizationPurgeManifest.organizationId, item.organizationId),
          eq(schema.organizationPurgeManifestItem.kind, 'razorpay_subscription'),
          or(
            eq(schema.organizationPurgeManifestItem.status, 'pending'),
            eq(schema.organizationPurgeManifestItem.status, 'failed'),
          ),
        ),
      )
      .limit(1);
    if (!active) return false;
    await cancel(item.razorpaySubscriptionId);
    await tx
      .update(schema.subscription)
      .set({
        planTier: 'hobby',
        subscriptionState: 'active',
        razorpaySubscriptionId: null,
        razorpayStatus: 'cancelled',
        cancelAtPeriodEnd: false,
        currentPeriodEnd: null,
        graceStartedAt: null,
        lockedAt: null,
        downgradedAt: null,
        preLapseTier: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(schema.subscription.organizationId, item.organizationId),
          eq(schema.subscription.razorpaySubscriptionId, item.razorpaySubscriptionId),
        ),
      );
    await tx
      .update(schema.organizationPurgeManifestItem)
      .set({ status: 'deleted', deletedAt: now, lastErrorCode: null, updatedAt: now })
      .where(eq(schema.organizationPurgeManifestItem.sequence, item.sequence));
    return true;
  });
}

function uniqueStorageKeys(input: {
  profileLogoKeys: Array<string | null>;
  images: Array<{
    originalKey: string;
    derivatives: Array<{ key: string }>;
  }>;
  verificationDocumentKeys: string[];
}): string[] {
  return [
    ...input.profileLogoKeys,
    ...input.images.flatMap(({ originalKey, derivatives }) => [
      originalKey,
      ...derivatives.map(({ key }) => key),
    ]),
    ...input.verificationDocumentKeys,
  ].filter((key): key is string => typeof key === 'string' && key.length > 0)
    .filter((key, index, keys) => keys.indexOf(key) === index);
}

/**
 * Lock the lifecycle, capture every external resource before cascades can remove
 * its database row, and move the lifecycle to the non-recoverable purging state.
 */
export async function prepareOrganizationPurge(
  organizationId: string,
  now: Date,
): Promise<PreparedOrganizationPurge | null> {
  return db.transaction(async (tx) => {
    await lockOrganization(tx, organizationId);
    const [retention] = await tx
      .select()
      .from(schema.organizationRetention)
      .where(eq(schema.organizationRetention.organizationId, organizationId))
      .for('update')
      .limit(1);
    if (!retention || retention.holdPlacedAt !== null) return null;
    const scheduled = retention.status === 'archived' && retention.hardDeleteDueAt <= now;
    if (
      retention.status !== 'purge_pending' &&
      retention.status !== 'purging' &&
      !scheduled
    ) {
      return null;
    }

    const [organization] = await tx
      .select({ slug: schema.organization.slug })
      .from(schema.organization)
      .where(eq(schema.organization.id, organizationId))
      .limit(1);
    if (!organization) return null;

    const profiles = await tx
      .select({ id: schema.designerProfile.id, logoImageId: schema.designerProfile.logoImageId })
      .from(schema.designerProfile)
      .where(eq(schema.designerProfile.orgId, organizationId));
    const profileIds = profiles.map(({ id }) => id);
    const projects =
      profileIds.length === 0
        ? []
        : await tx
            .select({ id: schema.project.id })
            .from(schema.project)
            .where(inArray(schema.project.designerId, profileIds));
    const projectIds = projects.map(({ id }) => id);
    const images =
      projectIds.length === 0
        ? []
        : await tx
            .select({
              originalKey: schema.projectImage.originalKey,
              derivatives: schema.projectImage.derivatives,
            })
            .from(schema.projectImage)
            .where(inArray(schema.projectImage.projectId, projectIds));
    const [latestUploadLease] = await tx
      .select({ expiresAt: max(schema.organizationUploadLease.expiresAt) })
      .from(schema.organizationUploadLease)
      .where(eq(schema.organizationUploadLease.organizationId, organizationId));
    const storageScanNotBefore = latestUploadLease?.expiresAt
      ? new Date(
          latestUploadLease.expiresAt.getTime() +
            config.ORGANIZATION_UPLOAD_SETTLE_SECONDS * 1_000,
        )
      : null;
    const [application] = await tx
      .select({ id: schema.verificationApplication.id })
      .from(schema.verificationApplication)
      .where(eq(schema.verificationApplication.organizationId, organizationId))
      .limit(1);
    const slots = application
      ? await tx
          .select({ id: schema.verificationDocumentSlot.id })
          .from(schema.verificationDocumentSlot)
          .where(eq(schema.verificationDocumentSlot.applicationId, application.id))
      : [];
    const verificationDocumentKeys =
      slots.length === 0
        ? []
        : (
            await tx
              .select({ objectKey: schema.verificationDocumentVersion.objectKey })
              .from(schema.verificationDocumentVersion)
              .where(
                inArray(
                  schema.verificationDocumentVersion.slotId,
                  slots.map(({ id }) => id),
                ),
              )
          ).map(({ objectKey }) => objectKey);

    const trigger = retention.purgeRequestedAt ? 'owner' : 'retention_schedule';
    const [manifest] = await tx
      .insert(schema.organizationPurgeManifest)
      .values({
        organizationId,
        organizationSlug: organization.slug,
        status: 'processing',
        trigger,
        requestedByUserId: trigger === 'owner' ? retention.requestedByUserId : null,
        attemptCount: 1,
        startedAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: schema.organizationPurgeManifest.organizationId,
        set: {
          status: 'processing',
          lastErrorCode: null,
          startedAt: now,
          updatedAt: now,
          attemptCount: sql`${schema.organizationPurgeManifest.attemptCount} + 1`,
        },
      })
      .returning({ id: schema.organizationPurgeManifest.id });
    if (!manifest) throw new Error('Failed to prepare organization purge manifest');

    const resourceKeys = uniqueStorageKeys({
      profileLogoKeys: profiles.map(({ logoImageId }) => logoImageId),
      images,
      verificationDocumentKeys,
    });
    if (resourceKeys.length > 0) {
      await tx
        .insert(schema.organizationPurgeManifestItem)
        .values(
          resourceKeys.map((resourceKey) => ({
            manifestId: manifest.id,
            kind: 'storage_object' as const,
            resourceKey,
            createdAt: now,
            updatedAt: now,
          })),
        )
        .onConflictDoNothing();
    }

    if (retention.status !== 'purging') {
      const revision = retention.revision + 1;
      await tx
        .update(schema.organizationRetention)
        .set({ status: 'purging', purgingAt: now, revision, updatedAt: now })
        .where(eq(schema.organizationRetention.organizationId, organizationId));
      await tx.insert(schema.organizationRetentionEvent).values({
        organizationId,
        revision,
        type: 'purge_started',
        trigger,
        actorUserId: trigger === 'owner' ? retention.requestedByUserId : null,
        occurredAt: now,
      });
    }

    const items = await tx
      .select({
        sequence: schema.organizationPurgeManifestItem.sequence,
        resourceKey: schema.organizationPurgeManifestItem.resourceKey,
      })
      .from(schema.organizationPurgeManifestItem)
      .where(
        and(
          eq(schema.organizationPurgeManifestItem.manifestId, manifest.id),
          eq(schema.organizationPurgeManifestItem.kind, 'storage_object'),
          or(
            eq(schema.organizationPurgeManifestItem.status, 'pending'),
            eq(schema.organizationPurgeManifestItem.status, 'failed'),
          ),
        ),
      )
      .orderBy(asc(schema.organizationPurgeManifestItem.sequence));

    return {
      manifestId: manifest.id,
      organizationId,
      projectIds,
      profileIds,
      items,
      storageScanNotBefore,
    };
  });
}

export async function appendPurgeStorageItems(
  manifestId: string,
  resourceKeys: string[],
  now: Date,
): Promise<PurgeManifestItem[]> {
  if (resourceKeys.length > 0) {
    await db
      .insert(schema.organizationPurgeManifestItem)
      .values(
        [...new Set(resourceKeys)].map((resourceKey) => ({
          manifestId,
          kind: 'storage_object' as const,
          resourceKey,
          createdAt: now,
          updatedAt: now,
        })),
      )
      .onConflictDoNothing();
  }
  return db
    .select({
      sequence: schema.organizationPurgeManifestItem.sequence,
      resourceKey: schema.organizationPurgeManifestItem.resourceKey,
    })
    .from(schema.organizationPurgeManifestItem)
    .where(
      and(
        eq(schema.organizationPurgeManifestItem.manifestId, manifestId),
        eq(schema.organizationPurgeManifestItem.kind, 'storage_object'),
        or(
          eq(schema.organizationPurgeManifestItem.status, 'pending'),
          eq(schema.organizationPurgeManifestItem.status, 'failed'),
        ),
      ),
    )
    .orderBy(asc(schema.organizationPurgeManifestItem.sequence));
}

export async function markPurgeManifestItemDeleted(sequence: bigint, now: Date): Promise<void> {
  await db
    .update(schema.organizationPurgeManifestItem)
    .set({ status: 'deleted', deletedAt: now, lastErrorCode: null, updatedAt: now })
    .where(eq(schema.organizationPurgeManifestItem.sequence, sequence));
}

export async function markPurgeManifestItemFailed(
  sequence: bigint,
  errorCode: string,
  now: Date,
): Promise<void> {
  await db
    .update(schema.organizationPurgeManifestItem)
    .set({
      status: 'failed',
      attemptCount: sql`${schema.organizationPurgeManifestItem.attemptCount} + 1`,
      lastErrorCode: errorCode,
      updatedAt: now,
    })
    .where(eq(schema.organizationPurgeManifestItem.sequence, sequence));
}

export async function markOrganizationPurgeFailed(
  manifestId: string,
  errorCode: string,
  now: Date,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [manifest] = await tx
      .update(schema.organizationPurgeManifest)
      .set({ status: 'failed', lastErrorCode: errorCode, updatedAt: now })
      .where(eq(schema.organizationPurgeManifest.id, manifestId))
      .returning({
        organizationId: schema.organizationPurgeManifest.organizationId,
        trigger: schema.organizationPurgeManifest.trigger,
        requestedByUserId: schema.organizationPurgeManifest.requestedByUserId,
      });
    if (!manifest) return;
    await lockOrganization(tx, manifest.organizationId);
    const [retention] = await tx
      .select()
      .from(schema.organizationRetention)
      .where(eq(schema.organizationRetention.organizationId, manifest.organizationId))
      .for('update')
      .limit(1);
    if (!retention || retention.status !== 'purging') return;
    const revision = retention.revision + 1;
    await tx
      .update(schema.organizationRetention)
      .set({ revision, updatedAt: now })
      .where(eq(schema.organizationRetention.organizationId, manifest.organizationId));
    await tx.insert(schema.organizationRetentionEvent).values({
      organizationId: manifest.organizationId,
      revision,
      type: 'purge_failed',
      trigger: manifest.trigger,
      actorUserId: manifest.requestedByUserId,
      details: { errorCode },
      occurredAt: now,
    });
  });
}

/**
 * Perform the destructive database phase only after every external deletion has
 * succeeded. The durable manifest header and audit events intentionally survive.
 */
export async function finalizeOrganizationPurge(
  prepared: PreparedOrganizationPurge,
  now: Date,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    await lockOrganization(tx, prepared.organizationId);
    const [retention] = await tx
      .select()
      .from(schema.organizationRetention)
      .where(eq(schema.organizationRetention.organizationId, prepared.organizationId))
      .for('update')
      .limit(1);
    if (!retention || retention.status !== 'purging' || retention.holdPlacedAt !== null) {
      return false;
    }
    const [pending] = await tx
      .select({ sequence: schema.organizationPurgeManifestItem.sequence })
      .from(schema.organizationPurgeManifestItem)
      .where(
        and(
          eq(schema.organizationPurgeManifestItem.manifestId, prepared.manifestId),
          or(
            eq(schema.organizationPurgeManifestItem.status, 'pending'),
            eq(schema.organizationPurgeManifestItem.status, 'failed'),
          ),
        ),
      )
      .limit(1);
    if (pending) return false;

    const profiles = await tx
      .select({ id: schema.designerProfile.id })
      .from(schema.designerProfile)
      .where(eq(schema.designerProfile.orgId, prepared.organizationId));
    const profileIds = profiles.map(({ id }) => id);
    const projects =
      profileIds.length === 0
        ? []
        : await tx
            .select({ id: schema.project.id, slug: schema.project.slug })
            .from(schema.project)
            .where(inArray(schema.project.designerId, profileIds));
    const projectIds = projects.map(({ id }) => id);

    if (projects.length > 0) {
      for (const slug of projects.map(({ slug }) => slug).sort()) {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${`project-slug:${slug}`}, 0))`,
        );
      }
      await tx
        .insert(schema.projectTombstone)
        .values(
          projects.map(({ id, slug }) => ({
            projectId: id,
            projectSlug: slug,
            organizationId: prepared.organizationId,
            purgedAt: now,
            createdAt: now,
          })),
        )
        .onConflictDoNothing();
      await tx.delete(schema.projectModerationEvent).where(
        inArray(schema.projectModerationEvent.projectId, projectIds),
      );
      await tx.delete(schema.projectReviewComment).where(
        inArray(schema.projectReviewComment.projectId, projectIds),
      );
    }

    if (profileIds.length > 0) {
      const reviews = await tx
        .select({ id: schema.review.id })
        .from(schema.review)
        .where(inArray(schema.review.designerProfileId, profileIds));
      const reviewIds = reviews.map(({ id }) => id);
      if (reviewIds.length > 0) {
        await tx
          .delete(schema.reviewModerationEvent)
          .where(inArray(schema.reviewModerationEvent.reviewId, reviewIds));
        await tx.delete(schema.review).where(inArray(schema.review.id, reviewIds));
      }
    }

    const applications = await tx
      .select({ id: schema.verificationApplication.id })
      .from(schema.verificationApplication)
      .where(eq(schema.verificationApplication.organizationId, prepared.organizationId));
    const applicationIds = applications.map(({ id }) => id);
    if (applicationIds.length > 0) {
      await tx
        .delete(schema.verificationReviewEvent)
        .where(inArray(schema.verificationReviewEvent.applicationId, applicationIds));
    }

    if (projectIds.length + profileIds.length > 0) {
      await tx.insert(schema.searchProjectionOutbox).values([
        ...projectIds.map((entityId) => ({
          entityKind: 'project' as const,
          entityId,
          operation: 'delete' as const,
          sourceUpdatedAt: now,
        })),
        ...profileIds.map((entityId) => ({
          entityKind: 'designer' as const,
          entityId,
          operation: 'delete' as const,
          sourceUpdatedAt: now,
        })),
      ]);
    }

    const teamIds = (
      await tx
        .select({ id: schema.team.id })
        .from(schema.team)
        .where(eq(schema.team.organizationId, prepared.organizationId))
    ).map(({ id }) => id);
    await tx
      .update(schema.session)
      .set({ activeOrganizationId: null, activeTeamId: null })
      .where(
        or(
          eq(schema.session.activeOrganizationId, prepared.organizationId),
          teamIds.length > 0 ? inArray(schema.session.activeTeamId, teamIds) : undefined,
        ),
      );

    const revision = retention.revision + 1;
    await tx.insert(schema.organizationRetentionEvent).values({
      organizationId: prepared.organizationId,
      revision,
      type: 'purge_completed',
      trigger: retention.purgeRequestedAt ? 'owner' : 'retention_schedule',
      actorUserId: retention.purgeRequestedAt ? retention.requestedByUserId : null,
      occurredAt: now,
    });
    await tx
      .delete(schema.organizationRetention)
      .where(eq(schema.organizationRetention.organizationId, prepared.organizationId));
    await tx.delete(schema.organization).where(eq(schema.organization.id, prepared.organizationId));
    await tx
      .delete(schema.organizationPurgeManifestItem)
      .where(eq(schema.organizationPurgeManifestItem.manifestId, prepared.manifestId));
    await tx
      .update(schema.organizationPurgeManifest)
      .set({ status: 'completed', completedAt: now, lastErrorCode: null, updatedAt: now })
      .where(eq(schema.organizationPurgeManifest.id, prepared.manifestId));
    return true;
  });
}
