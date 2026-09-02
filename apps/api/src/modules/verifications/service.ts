import { randomUUID } from 'node:crypto';
import {
  ORGANIZATION_CAPABILITY,
  MIN_VERIFICATION_PUBLISHED_PROJECTS,
  PERSONAL_VERIFICATION_DOCUMENT_TYPES,
  VERIFICATION_APPLICATION_STATUS,
  VERIFICATION_DOCUMENT_STATUS,
  VERIFICATION_EFFECTIVE_STATUS,
  VERIFICATION_REVIEW_ACTION,
  verificationDocumentContentTypeSchema,
  type AdminVerificationDetailResponse,
  type AdminVerificationQueueQuery,
  type RejectVerificationInput,
  type VerificationDocumentUploadInput,
  type VerificationStateResponse,
} from '@repo/contracts';
import { config } from '@repo/config';
import {
  buildVerificationDocumentKey,
  deleteObject,
  objectExists,
  presignDownload,
  presignUpload,
} from '@repo/storage';
import { AppError } from '../../lib/errors.js';
import { orgsService } from '../orgs/service.js';
import {
  hasBusinessDocument,
  isApplicationEditable,
  VERIFICATION_MUTATION_RESULT,
  verificationsRepository,
  type AdminVerificationRecord,
  type VerificationApplicationRecord,
  type VerificationContextRecord,
  type VerificationDocumentRecord,
} from './repository.js';

const personalIdentityDocumentTypes = new Set<VerificationDocumentRecord['type']>(
  PERSONAL_VERIFICATION_DOCUMENT_TYPES,
);

export type VerificationCaller = {
  userId: string;
  activeOrgId: string | null;
};

function requireActiveOrganization(caller: VerificationCaller): string {
  if (!caller.activeOrgId) throw AppError.unprocessable('Select an active organization');
  return caller.activeOrgId;
}

async function assertMember(caller: VerificationCaller): Promise<string> {
  const organizationId = requireActiveOrganization(caller);
  if (!(await orgsService.isMember(caller.userId, organizationId))) {
    throw AppError.forbidden('You are not a member of the active organization');
  }
  return organizationId;
}

async function assertWriter(caller: VerificationCaller): Promise<string> {
  const organizationId = requireActiveOrganization(caller);
  if (
    !(await orgsService.hasCapability(
      caller.userId,
      organizationId,
      ORGANIZATION_CAPABILITY.MANAGE_VERIFICATION,
    ))
  ) {
    throw AppError.forbidden('Organization owner or admin access required');
  }
  return organizationId;
}

function latestDocuments(documents: VerificationDocumentRecord[]): VerificationDocumentRecord[] {
  const latest = new Map<VerificationDocumentRecord['type'], VerificationDocumentRecord>();
  for (const document of documents) {
    if (!latest.has(document.type)) latest.set(document.type, document);
  }
  return [...latest.values()].filter(
    (document) => document.status !== VERIFICATION_DOCUMENT_STATUS.REMOVED,
  );
}

function isPersonalIdentityDocument(type: VerificationDocumentRecord['type']): boolean {
  return personalIdentityDocumentTypes.has(type);
}

async function assertPersonalIdentityOwner(
  caller: VerificationCaller,
  organizationId: string,
  type: VerificationDocumentRecord['type'],
): Promise<void> {
  if (!isPersonalIdentityDocument(type)) return;
  const context = await verificationsRepository.findContextByOrganization(organizationId);
  if (!context || context.ownerUserId !== caller.userId) {
    throw AppError.forbidden('Only the organization owner can manage personal identity');
  }
}

function effectiveStatus(application: VerificationApplicationRecord) {
  if (
    application.status === VERIFICATION_APPLICATION_STATUS.VERIFIED &&
    application.expiresAt &&
    application.expiresAt <= new Date()
  ) {
    return VERIFICATION_EFFECTIVE_STATUS.EXPIRED;
  }
  return application.status;
}

function documentDto(document: VerificationDocumentRecord) {
  const contentType = verificationDocumentContentTypeSchema.safeParse(document.contentType);
  if (!contentType.success) throw new Error('Unsupported verification document content type');
  return {
    id: document.id,
    type: document.type,
    version: document.version,
    status: document.status,
    contentType: contentType.data,
    size: document.contentLength,
    committedAt: document.committedAt?.toISOString() ?? null,
    createdAt: document.createdAt.toISOString(),
  };
}

function historyDto(history: Awaited<ReturnType<typeof verificationsRepository.listHistory>>) {
  return history.map((event) => ({
    id: event.id,
    attempt: event.attempt,
    action: event.action,
    fromStatus: event.fromStatus,
    toStatus: event.toStatus,
    actorLabel:
      event.action === VERIFICATION_REVIEW_ACTION.SUBMITTED ||
      event.action === VERIFICATION_REVIEW_ACTION.RESUBMITTED
        ? 'Designer'
        : 'Tickif Review Team',
    note: event.note,
    createdAt: event.createdAt.toISOString(),
  }));
}

function eligibility(
  context: VerificationContextRecord,
  documents: VerificationDocumentRecord[],
): VerificationStateResponse['eligibility'] {
  const phoneVerified = context.ownerPhoneVerified && !!context.ownerPhone;
  const legalNamePresent = context.ownerName.trim().length >= 2;
  const businessDocumentPresent = hasBusinessDocument(documents);
  const enoughProjects = context.publishedProjectCount >= MIN_VERIFICATION_PUBLISHED_PROJECTS;
  return {
    eligible: phoneVerified && legalNamePresent && businessDocumentPresent && enoughProjects,
    phoneVerified: { met: phoneVerified, label: 'Verify the account owner phone number' },
    legalNamePresent: { met: legalNamePresent, label: 'Add the account owner legal name' },
    businessDocumentPresent: {
      met: businessDocumentPresent,
      label: 'Upload at least one supported business document',
    },
    publishedProjects: {
      met: enoughProjects,
      label: `Publish at least ${MIN_VERIFICATION_PUBLISHED_PROJECTS} projects`,
      current: context.publishedProjectCount,
      required: MIN_VERIFICATION_PUBLISHED_PROJECTS,
    },
  };
}

async function stateForContext(
  context: VerificationContextRecord,
  callerUserId: string,
  canManage: boolean,
): Promise<VerificationStateResponse> {
  const [allDocuments, history] = await Promise.all([
    verificationsRepository.listDocuments(context.application.id),
    verificationsRepository.listHistory(context.application.id),
  ]);
  const documents = latestDocuments(allDocuments);
  const latestRejection = [...history]
    .reverse()
    .find((event) => event.action === VERIFICATION_REVIEW_ACTION.REJECTED);
  const canEditIdentity = context.ownerUserId === callerUserId;
  return {
    applicationId: context.application.id,
    status: effectiveStatus(context.application),
    applicationEditable: isApplicationEditable(context.application),
    attempt: context.application.attempt,
    identity: {
      ownerName: context.ownerName,
      ownerPhone: canEditIdentity ? context.ownerPhone : null,
      canEdit: canEditIdentity,
    },
    permissions: { canManage },
    eligibility: eligibility(context, documents),
    documents: documents.map(documentDto),
    history: historyDto(history),
    latestNote:
      context.application.status === VERIFICATION_APPLICATION_STATUS.REJECTED
        ? (latestRejection?.note ?? null)
        : null,
    submittedAt: context.application.submittedAt?.toISOString() ?? null,
    reviewedAt: context.application.reviewedAt?.toISOString() ?? null,
    approvedAt: context.application.approvedAt?.toISOString() ?? null,
    expiresAt: context.application.expiresAt?.toISOString() ?? null,
  };
}

function addCalendarMonths(date: Date, months: number): Date {
  const result = new Date(date);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

function adminDetail(
  context: AdminVerificationRecord,
  documents: VerificationDocumentRecord[],
  history: Awaited<ReturnType<typeof verificationsRepository.listHistory>>,
): AdminVerificationDetailResponse {
  const applicationEligibility = eligibility(context, latestDocuments(documents));
  return {
    application: {
      id: context.application.id,
      organizationId: context.application.organizationId,
      organizationName: context.organizationName,
      designerName: context.designerName,
      ownerName: context.ownerName,
      ownerEmail: context.ownerEmail,
      ownerPhone: context.ownerPhone,
      status: context.application.status,
      attempt: context.application.attempt,
      submittedAt: context.application.submittedAt?.toISOString() ?? null,
      reviewedAt: context.application.reviewedAt?.toISOString() ?? null,
      approvedAt: context.application.approvedAt?.toISOString() ?? null,
      expiresAt: context.application.expiresAt?.toISOString() ?? null,
    },
    eligibility: {
      phoneVerified: applicationEligibility.phoneVerified,
      publishedProjects: applicationEligibility.publishedProjects,
    },
    documents: latestDocuments(documents).map(documentDto),
    history: historyDto(history),
  };
}

async function getAdminDetail(applicationId: string): Promise<AdminVerificationDetailResponse> {
  const context = await verificationsRepository.findAdminDetail(applicationId);
  if (!context) throw AppError.notFound('Verification application not found');
  const [documents, history] = await Promise.all([
    verificationsRepository.listDocuments(applicationId),
    verificationsRepository.listHistory(applicationId),
  ]);
  return adminDetail(context, documents, history);
}

export const verificationsService = {
  async getState(caller: VerificationCaller): Promise<VerificationStateResponse> {
    const organizationId = await assertMember(caller);
    await verificationsRepository.getOrCreateForOrganization(organizationId);
    const [context, canManage] = await Promise.all([
      verificationsRepository.findContextByOrganization(organizationId),
      orgsService.hasCapability(
        caller.userId,
        organizationId,
        ORGANIZATION_CAPABILITY.MANAGE_VERIFICATION,
      ),
    ]);
    if (!context) throw AppError.unprocessable('Complete designer onboarding before verification');
    return stateForContext(context, caller.userId, canManage);
  },

  async createUpload(caller: VerificationCaller, input: VerificationDocumentUploadInput) {
    const organizationId = await assertWriter(caller);
    await assertPersonalIdentityOwner(caller, organizationId, input.type);
    if (input.size > config.MEDIA_MAX_UPLOAD_BYTES) {
      throw AppError.unprocessable(
        `Document must be ${config.MEDIA_MAX_UPLOAD_BYTES} bytes or smaller`,
      );
    }
    const application = await verificationsRepository.getOrCreateForOrganization(organizationId);
    const documentVersionId = randomUUID();
    const key = buildVerificationDocumentKey(organizationId, documentVersionId);
    const reserved = await verificationsRepository.reserveDocumentVersion({
      applicationId: application.id,
      documentVersionId,
      type: input.type,
      objectKey: key,
      contentType: input.contentType,
      contentLength: input.size,
      userId: caller.userId,
    });
    if (reserved === VERIFICATION_MUTATION_RESULT.STATE_CHANGED) {
      throw AppError.invalidTransition('Documents cannot be changed while verification is pending');
    }
    if (typeof reserved === 'string') throw AppError.notFound('Verification application not found');
    try {
      return {
        documentVersionId,
        uploadUrl: await presignUpload({
          key,
          contentType: input.contentType,
          contentLength: input.size,
        }),
      };
    } catch (error) {
      await verificationsRepository
        .cancelPendingDocument(documentVersionId, organizationId)
        .catch(() => undefined);
      throw error;
    }
  },

  async removeDocument(
    caller: VerificationCaller,
    versionId: string,
  ): Promise<VerificationStateResponse> {
    const organizationId = await assertWriter(caller);
    const document = await verificationsRepository.findDocumentForOrganization(
      versionId,
      organizationId,
    );
    if (!document) throw AppError.notFound('Verification document not found');
    await assertPersonalIdentityOwner(caller, organizationId, document.type);

    if (document.status === VERIFICATION_DOCUMENT_STATUS.PENDING_UPLOAD) {
      if (document.uploadedByUserId !== caller.userId) {
        throw AppError.forbidden('Only the uploader can cancel this document upload');
      }
      const cancelled = await verificationsRepository.cancelPendingDocument(
        versionId,
        organizationId,
      );
      if (cancelled === VERIFICATION_MUTATION_RESULT.DOCUMENT_NOT_FOUND) {
        throw AppError.notFound('Verification document not found');
      }
      if (typeof cancelled === 'string') {
        throw AppError.conflict('Verification document state changed');
      }
      await deleteObject(cancelled.objectKey).catch(() => undefined);
      return this.getState(caller);
    }

    const removed = await verificationsRepository.removeCommittedDocument(
      versionId,
      organizationId,
      caller.userId,
    );
    if (removed === VERIFICATION_MUTATION_RESULT.DOCUMENT_NOT_FOUND) {
      throw AppError.notFound('Verification document not found');
    }
    if (typeof removed === 'string') {
      throw AppError.conflict('Verification document state changed');
    }
    // Committed objects are retained with their removed audit record. A future
    // retention job can purge them after the required review window.
    return this.getState(caller);
  },

  async commitUpload(
    caller: VerificationCaller,
    versionId: string,
  ): Promise<VerificationStateResponse> {
    const organizationId = await assertWriter(caller);
    const document = await verificationsRepository.findDocumentForOrganization(
      versionId,
      organizationId,
    );
    if (!document) throw AppError.notFound('Verification document not found');
    await assertPersonalIdentityOwner(caller, organizationId, document.type);
    if (document.status !== VERIFICATION_DOCUMENT_STATUS.PENDING_UPLOAD) {
      throw AppError.conflict('Verification document was already committed');
    }
    if (!(await objectExists(document.objectKey))) {
      throw AppError.unprocessable('Upload the document before committing it');
    }
    const committed = await verificationsRepository.commitDocument(versionId, organizationId);
    if (typeof committed === 'string') {
      throw AppError.conflict('Verification document state changed');
    }
    return this.getState(caller);
  },

  async submit(caller: VerificationCaller): Promise<VerificationStateResponse> {
    const organizationId = await assertWriter(caller);
    const context = await verificationsRepository.findContextByOrganization(organizationId);
    if (!context) throw AppError.notFound('Verification application not found');
    if (!isApplicationEditable(context.application)) {
      throw AppError.invalidTransition('Verification is already pending or approved');
    }
    const documents = latestDocuments(
      await verificationsRepository.listDocuments(context.application.id),
    );
    const [hasIncompleteDocument] = await Promise.all([
      verificationsRepository.hasIncompleteDocument(context.application.id),
    ]);
    const currentEligibility = eligibility(context, documents);
    const hasRejectedDocument = documents.some(
      (document) => document.status === VERIFICATION_DOCUMENT_STATUS.REJECTED,
    );
    if (!currentEligibility.eligible || hasIncompleteDocument || hasRejectedDocument) {
      throw AppError.unprocessable('Verification eligibility requirements are not met', {
        eligibility: currentEligibility,
        hasIncompleteDocument,
        hasRejectedDocument,
      });
    }
    const result = await verificationsRepository.submit({
      applicationId: context.application.id,
      userId: caller.userId,
      expectedStatus: context.application.status,
    });
    if (result === VERIFICATION_MUTATION_RESULT.INVALID_DOCUMENTS) {
      throw AppError.unprocessable('Verification eligibility requirements changed');
    }
    if (typeof result === 'string') {
      throw AppError.invalidTransition('Verification application state changed');
    }
    return this.getState(caller);
  },

  async listAdmin(query: AdminVerificationQueueQuery) {
    const { items, total } = await verificationsRepository.listPending(query);
    return {
      items: items.map((item) => ({ ...item, submittedAt: item.submittedAt.toISOString() })),
      page: query.page,
      limit: query.limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / query.limit),
    };
  },

  getAdminDetail,

  async downloadDocument(applicationId: string, versionId: string) {
    const context = await verificationsRepository.findAdminDetail(applicationId);
    if (!context) throw AppError.notFound('Verification application not found');
    const document = await verificationsRepository.findDocumentForOrganization(
      versionId,
      context.application.organizationId,
    );
    if (!document) throw AppError.notFound('Verification document not found');
    if (
      document.status === VERIFICATION_DOCUMENT_STATUS.PENDING_UPLOAD ||
      document.status === VERIFICATION_DOCUMENT_STATUS.REMOVED
    ) {
      throw AppError.notFound('Verification document not found');
    }
    return {
      downloadUrl: await presignDownload({
        key: document.objectKey,
        expiresIn: config.R2_VERIFICATION_DOWNLOAD_URL_EXPIRY_SECONDS,
      }),
    };
  },

  async approve(applicationId: string, reviewerId: string) {
    const expiresAt = addCalendarMonths(new Date(), 2);
    const result = await verificationsRepository.review({
      applicationId,
      reviewerId,
      decision: 'approve',
      expiresAt,
    });
    if (result === VERIFICATION_MUTATION_RESULT.NOT_FOUND) {
      throw AppError.notFound('Verification application not found');
    }
    if (result === VERIFICATION_MUTATION_RESULT.INVALID_DOCUMENTS) {
      throw AppError.unprocessable('Verification has no reviewable documents');
    }
    if (result === VERIFICATION_MUTATION_RESULT.INELIGIBLE) {
      throw AppError.unprocessable('Verification eligibility requirements are no longer met');
    }
    if (typeof result === 'string') {
      throw AppError.invalidTransition('Verification application is no longer pending');
    }
    return getAdminDetail(applicationId);
  },

  async reject(applicationId: string, reviewerId: string, input: RejectVerificationInput) {
    const result = await verificationsRepository.review({
      applicationId,
      reviewerId,
      decision: 'reject',
      rejection: input,
    });
    if (result === VERIFICATION_MUTATION_RESULT.NOT_FOUND) {
      throw AppError.notFound('Verification application not found');
    }
    if (result === VERIFICATION_MUTATION_RESULT.INVALID_DOCUMENTS) {
      throw AppError.unprocessable('Rejected documents must belong to this pending application');
    }
    if (typeof result === 'string') {
      throw AppError.invalidTransition('Verification application is no longer pending');
    }
    return getAdminDetail(applicationId);
  },
};
