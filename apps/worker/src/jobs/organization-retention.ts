import { deleteSearchDocument, deleteSearchProjectsByDesigner } from '@repo/search';
import { deleteObject, listObjectKeys } from '@repo/storage';
import {
  appendPurgeStorageItems,
  archiveOrganization,
  confirmProviderCleanup,
  finalizeOrganizationPurge,
  findOrganizationsDueForArchive,
  findOrganizationsDueForPurge,
  findPendingProviderCleanup,
  isStorageKeyReferencedOutsideOrganization,
  markOrganizationPurgeFailed,
  markPurgeManifestItemDeleted,
  markPurgeManifestItemFailed,
  prepareOrganizationPurge,
  type PreparedOrganizationPurge,
} from '../organization-retention/repository.js';
import { cancelRazorpaySubscription } from '../organization-retention/razorpay.js';

const RETENTION_BATCH_SIZE = 50;

export type OrganizationRetentionSweepResult = {
  archived: number;
  purged: number;
  failed: number;
};

function errorCode(error: unknown): string {
  if (error instanceof Error && error.name) return error.name.slice(0, 100);
  return 'UnknownError';
}

async function deleteStorageItems(
  prepared: PreparedOrganizationPurge,
  now: Date,
): Promise<void> {
  for (const item of prepared.items) {
    try {
      const shared = await isStorageKeyReferencedOutsideOrganization(
        item.resourceKey,
        prepared.organizationId,
      );
      // S3-compatible DELETE is idempotent when the key is already absent. A
      // shared immutable object stays alive for the other organization.
      if (!shared) await deleteObject(item.resourceKey);
      await markPurgeManifestItemDeleted(item.sequence, now);
    } catch (error) {
      await markPurgeManifestItemFailed(item.sequence, errorCode(error), now);
      throw error;
    }
  }
}

async function deleteSearchDocuments(prepared: PreparedOrganizationPurge): Promise<void> {
  for (const projectId of prepared.projectIds) {
    await deleteSearchDocument('projects', projectId);
  }
  for (const profileId of prepared.profileIds) {
    await deleteSearchDocument('designers', profileId);
    await deleteSearchProjectsByDesigner(profileId);
  }
}

async function purgeOrganization(organizationId: string, now: Date): Promise<boolean> {
  const prepared = await prepareOrganizationPurge(organizationId, now);
  if (!prepared) return false;
  if (prepared.storageScanNotBefore && prepared.storageScanNotBefore > now) return false;
  try {
    const scanStorage = async () => {
      const keys = (
        await Promise.all([
          ...prepared.projectIds.flatMap((projectId) => [
            listObjectKeys(`originals/${projectId}/`),
            listObjectKeys(`derivatives/${projectId}/`),
          ]),
          listObjectKeys(`verification-documents/${prepared.organizationId}/`),
        ])
      ).flat();
      return appendPurgeStorageItems(prepared.manifestId, keys, now);
    };
    await deleteStorageItems(prepared, now);
    await deleteStorageItems({ ...prepared, items: await scanStorage() }, now);
    // Re-scan after deletion. This catches writes that completed while the first
    // inventory was being read, while the media lease prevents any later writes.
    await deleteStorageItems({ ...prepared, items: await scanStorage() }, now);
    await deleteSearchDocuments(prepared);
    return finalizeOrganizationPurge(prepared, now);
  } catch (error) {
    await markOrganizationPurgeFailed(prepared.manifestId, errorCode(error), now);
    throw error;
  }
}

/** Archive and purge due organizations as part of the shared lifecycle tick. */
export async function processOrganizationRetentionSweep(
  now: Date,
): Promise<OrganizationRetentionSweepResult> {
  let archived = 0;
  let purged = 0;
  let failed = 0;

  const providerCleanup = await findPendingProviderCleanup(RETENTION_BATCH_SIZE);
  for (const item of providerCleanup) {
    try {
      await cancelRazorpaySubscription(item.razorpaySubscriptionId);
      await confirmProviderCleanup(item, now);
    } catch (error) {
      failed += 1;
      await markPurgeManifestItemFailed(item.sequence, errorCode(error), now);
      console.error('[worker] Razorpay subscription cleanup failed:', error);
    }
  }

  const archiveCandidates = await findOrganizationsDueForArchive(now, RETENTION_BATCH_SIZE);
  for (const candidate of archiveCandidates) {
    try {
      if (await archiveOrganization(candidate.organizationId, now)) archived += 1;
    } catch (error) {
      failed += 1;
      console.error('[worker] organization archive transition failed:', error);
    }
  }

  const purgeCandidates = await findOrganizationsDueForPurge(now, RETENTION_BATCH_SIZE);
  for (const candidate of purgeCandidates) {
    try {
      if (await purgeOrganization(candidate.organizationId, now)) purged += 1;
    } catch (error) {
      failed += 1;
      console.error('[worker] organization purge failed:', error);
    }
  }

  return { archived, purged, failed };
}
