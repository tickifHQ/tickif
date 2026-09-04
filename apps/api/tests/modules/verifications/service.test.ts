import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ADMIN_VERIFICATION_QUEUE_TAB,
  VERIFICATION_APPLICATION_STATUS,
  VERIFICATION_DOCUMENT_STATUS,
  VERIFICATION_EFFECTIVE_STATUS,
  VERIFICATION_REVIEW_ACTION,
} from '@repo/contracts';

vi.mock('@repo/config', () => ({
  config: {
    MEDIA_MAX_UPLOAD_BYTES: 15_000_000,
    R2_VERIFICATION_DOWNLOAD_URL_EXPIRY_SECONDS: 60,
  },
}));
vi.mock('@repo/storage', () => ({
  buildVerificationDocumentKey: vi.fn(
    (organizationId: string, versionId: string) =>
      `verification-documents/${organizationId}/${versionId}`,
  ),
  objectExists: vi.fn(async () => true),
  deleteObject: vi.fn(async () => undefined),
  presignDownload: vi.fn(async () => 'https://storage.test/download'),
  presignUpload: vi.fn(async () => 'https://storage.test/upload'),
}));
vi.mock('../../../src/modules/orgs/service.js', () => ({
  orgsService: {
    isMember: vi.fn(async () => true),
    hasCapability: vi.fn(async () => true),
  },
}));
vi.mock('../../../src/modules/verifications/repository.js', () => ({
  VERIFICATION_MUTATION_RESULT: {
    NOT_FOUND: 'not_found',
    STATE_CHANGED: 'state_changed',
    DOCUMENT_NOT_FOUND: 'document_not_found',
    INVALID_DOCUMENTS: 'invalid_documents',
    INELIGIBLE: 'ineligible',
  },
  hasBusinessDocument: vi.fn((documents: Array<{ type: string; status: string }>) =>
    documents.some(
      (document) =>
        document.type === 'gst_registration_certificate' &&
        ['uploaded', 'verified'].includes(document.status),
    ),
  ),
  isApplicationEditable: vi.fn(
    (application: { status: string; expiresAt: Date | null }) =>
      application.status === 'draft' ||
      application.status === 'rejected' ||
      (application.status === 'verified' &&
        application.expiresAt !== null &&
        application.expiresAt <= new Date()),
  ),
  verificationsRepository: {
    getOrCreateForOrganization: vi.fn(),
    findContextByOrganization: vi.fn(),
    listDocuments: vi.fn(),
    hasIncompleteDocument: vi.fn(),
    listHistory: vi.fn(),
    reserveDocumentVersion: vi.fn(),
    findDocumentForOrganization: vi.fn(),
    commitDocument: vi.fn(),
    cancelPendingDocument: vi.fn(async () => 'state_changed'),
    releaseUploadLease: vi.fn(async () => undefined),
    removeCommittedDocument: vi.fn(),
    submit: vi.fn(),
    listAdminQueue: vi.fn(),
    findAdminDetail: vi.fn(),
    review: vi.fn(),
  },
}));

const { verificationsService } = await import('../../../src/modules/verifications/service.js');
const { verificationsRepository } =
  await import('../../../src/modules/verifications/repository.js');
const { orgsService } = await import('../../../src/modules/orgs/service.js');
const { deleteObject, presignDownload, presignUpload } = await import('@repo/storage');

const application = {
  id: '0d8e6a2c-1b3f-4c5a-9e2d-7f1a2b3c4d5e',
  organizationId: 'org-1',
  status: VERIFICATION_APPLICATION_STATUS.DRAFT,
  attempt: 1,
  submittedAt: null,
  reviewedAt: null,
  approvedAt: null,
  expiresAt: null,
  reviewedByUserId: null,
  createdAt: new Date('2026-08-01T00:00:00.000Z'),
  updatedAt: new Date('2026-08-01T00:00:00.000Z'),
} as const;

const context = {
  application,
  designerProfileId: '8bc0e9bb-9abb-4551-9579-c29d6d51acbe',
  designerName: 'Studio One',
  ownerUserId: 'user-1',
  ownerName: 'Aditya Garud',
  ownerEmail: 'aditya@example.com',
  ownerPhone: '+919999999999',
  ownerPhoneVerified: true,
  publishedProjectCount: 3,
};

const document = {
  id: '9c08cc34-697a-455a-8b66-41c193402174',
  slotId: 'bbd81bf4-1ba2-48f3-8f05-d89491f471c9',
  type: 'gst_registration_certificate' as const,
  version: 1,
  objectKey: 'verification-documents/org-1/version-1',
  contentType: 'application/pdf',
  contentLength: 1000,
  status: VERIFICATION_DOCUMENT_STATUS.UPLOADED,
  uploadedByUserId: 'user-1',
  committedAt: new Date('2026-08-01T00:00:00.000Z'),
  reviewedAt: null,
  reviewedByUserId: null,
  removedAt: null,
  removedByUserId: null,
  createdAt: new Date('2026-08-01T00:00:00.000Z'),
};

const caller = { userId: 'user-1', activeOrgId: 'org-1' };

describe('verificationsService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-13T00:00:00.000Z'));
    vi.clearAllMocks();
    vi.mocked(orgsService.isMember).mockResolvedValue(true);
    vi.mocked(orgsService.hasCapability).mockResolvedValue(true);
    vi.mocked(verificationsRepository.getOrCreateForOrganization).mockResolvedValue(application);
    vi.mocked(verificationsRepository.findContextByOrganization).mockResolvedValue(context);
    vi.mocked(verificationsRepository.listDocuments).mockResolvedValue([document]);
    vi.mocked(verificationsRepository.hasIncompleteDocument).mockResolvedValue(false);
    vi.mocked(verificationsRepository.listHistory).mockResolvedValue([]);
  });

  afterEach(() => vi.useRealTimers());

  it('returns server-derived eligibility from the account, documents, and projects', async () => {
    const result = await verificationsService.getState(caller);

    expect(result.status).toBe(VERIFICATION_APPLICATION_STATUS.DRAFT);
    expect(result.applicationEditable).toBe(true);
    expect(result.identity).toEqual({
      ownerName: 'Aditya Garud',
      ownerPhone: '+919999999999',
      canEdit: true,
    });
    expect(result.permissions).toEqual({ canManage: true });
    expect(result.eligibility.eligible).toBe(true);
    expect(result.eligibility.publishedProjects).toMatchObject({ current: 3, required: 3 });
    expect(result.documents).toHaveLength(1);
  });

  it('does not expose the owner phone or identity edits to another organization member', async () => {
    vi.mocked(orgsService.hasCapability).mockResolvedValue(false);

    const result = await verificationsService.getState({ ...caller, userId: 'member-2' });

    expect(result.identity).toMatchObject({ ownerPhone: null, canEdit: false });
    expect(result.permissions).toEqual({ canManage: false });
  });

  it('returns designer-safe review history and the latest changes-requested note', async () => {
    vi.mocked(verificationsRepository.listHistory).mockResolvedValue([
      {
        id: 'd9cb1795-ecbf-4ed0-a28a-9768ab47f80e',
        applicationId: application.id,
        attempt: 1,
        action: VERIFICATION_REVIEW_ACTION.REJECTED,
        actorUserId: 'admin-1',
        fromStatus: VERIFICATION_APPLICATION_STATUS.PENDING,
        toStatus: VERIFICATION_APPLICATION_STATUS.REJECTED,
        note: 'Please upload a clearer certificate.',
        rejectedDocumentVersionIds: [document.id],
        createdAt: new Date('2026-08-02T00:00:00.000Z'),
      },
    ]);
    vi.mocked(verificationsRepository.findContextByOrganization).mockResolvedValue({
      ...context,
      application: {
        ...application,
        status: VERIFICATION_APPLICATION_STATUS.REJECTED,
        submittedAt: new Date('2026-08-01T00:00:00.000Z'),
        reviewedAt: new Date('2026-08-02T00:00:00.000Z'),
      },
    });

    await expect(verificationsService.getState(caller)).resolves.toMatchObject({
      latestNote: 'Please upload a clearer certificate.',
      history: [
        {
          actorLabel: 'Tickif Review Team',
          note: 'Please upload a clearer certificate.',
        },
      ],
    });
  });

  it('surfaces the approval revocation reason while the application is pending re-review', async () => {
    vi.mocked(verificationsRepository.listHistory).mockResolvedValue([
      {
        id: 'd9cb1795-ecbf-4ed0-a28a-9768ab47f81e',
        applicationId: application.id,
        attempt: 2,
        action: VERIFICATION_REVIEW_ACTION.APPROVAL_REVOKED,
        actorUserId: 'admin-1',
        fromStatus: VERIFICATION_APPLICATION_STATUS.VERIFIED,
        toStatus: VERIFICATION_APPLICATION_STATUS.PENDING,
        note: 'The identity evidence needs another review.',
        rejectedDocumentVersionIds: [],
        createdAt: new Date('2026-08-03T00:00:00.000Z'),
      },
    ]);
    vi.mocked(verificationsRepository.findContextByOrganization).mockResolvedValue({
      ...context,
      application: {
        ...application,
        status: VERIFICATION_APPLICATION_STATUS.PENDING,
        attempt: 2,
        submittedAt: new Date('2026-08-03T00:00:00.000Z'),
      },
    });

    await expect(verificationsService.getState(caller)).resolves.toMatchObject({
      status: VERIFICATION_APPLICATION_STATUS.PENDING,
      latestNote: 'The identity evidence needs another review.',
    });
  });

  it('treats an elapsed approval as expired without mutating stored history', async () => {
    vi.mocked(verificationsRepository.findContextByOrganization).mockResolvedValue({
      ...context,
      application: {
        ...application,
        status: VERIFICATION_APPLICATION_STATUS.VERIFIED,
        submittedAt: new Date('2026-05-01T00:00:00.000Z'),
        reviewedAt: new Date('2026-05-02T00:00:00.000Z'),
        approvedAt: new Date('2026-05-02T00:00:00.000Z'),
        expiresAt: new Date('2026-07-02T00:00:00.000Z'),
      },
    });

    await expect(verificationsService.getState(caller)).resolves.toMatchObject({
      status: VERIFICATION_EFFECTIVE_STATUS.EXPIRED,
    });
  });

  it('rejects submission when a server-derived requirement is missing', async () => {
    vi.mocked(verificationsRepository.findContextByOrganization).mockResolvedValue({
      ...context,
      publishedProjectCount: 2,
    });

    await expect(verificationsService.submit(caller)).rejects.toMatchObject({
      code: 'validation_error',
      status: 422,
    });
    expect(verificationsRepository.submit).not.toHaveBeenCalled();
  });

  it('rejects resubmission while the latest business document is still rejected', async () => {
    const rejectedApplication = {
      ...application,
      status: VERIFICATION_APPLICATION_STATUS.REJECTED,
      submittedAt: new Date('2026-08-01T00:00:00.000Z'),
      reviewedAt: new Date('2026-08-02T00:00:00.000Z'),
    };
    vi.mocked(verificationsRepository.findContextByOrganization).mockResolvedValue({
      ...context,
      application: rejectedApplication,
    });
    vi.mocked(verificationsRepository.listDocuments).mockResolvedValue([
      { ...document, status: VERIFICATION_DOCUMENT_STATUS.REJECTED },
    ]);

    await expect(verificationsService.getState(caller)).resolves.toMatchObject({
      status: VERIFICATION_APPLICATION_STATUS.REJECTED,
      eligibility: {
        eligible: false,
        businessDocumentPresent: { met: false },
      },
    });
    await expect(verificationsService.submit(caller)).rejects.toMatchObject({
      code: 'validation_error',
      status: 422,
    });
    expect(verificationsRepository.submit).not.toHaveBeenCalled();
  });

  it('rejects resubmission while an optional identity document still needs replacement', async () => {
    vi.mocked(verificationsRepository.findContextByOrganization).mockResolvedValue({
      ...context,
      application: {
        ...application,
        status: VERIFICATION_APPLICATION_STATUS.REJECTED,
        submittedAt: new Date('2026-08-01T00:00:00.000Z'),
        reviewedAt: new Date('2026-08-02T00:00:00.000Z'),
      },
    });
    vi.mocked(verificationsRepository.listDocuments).mockResolvedValue([
      { ...document, status: VERIFICATION_DOCUMENT_STATUS.VERIFIED },
      {
        ...document,
        id: '668388de-2aa9-4aaf-afda-d352ad198169',
        slotId: 'd9012a16-f987-4109-9b3b-b5d7e195b6dc',
        type: 'personal_pan',
        status: VERIFICATION_DOCUMENT_STATUS.REJECTED,
      },
    ]);

    await expect(verificationsService.submit(caller)).rejects.toMatchObject({
      code: 'validation_error',
      status: 422,
    });
    expect(verificationsRepository.submit).not.toHaveBeenCalled();
  });

  it('rejects resubmission while any document upload is incomplete', async () => {
    const rejectedApplication = {
      ...application,
      status: VERIFICATION_APPLICATION_STATUS.REJECTED,
      submittedAt: new Date('2026-08-01T00:00:00.000Z'),
      reviewedAt: new Date('2026-08-02T00:00:00.000Z'),
    };
    vi.mocked(verificationsRepository.findContextByOrganization).mockResolvedValue({
      ...context,
      application: rejectedApplication,
    });
    vi.mocked(verificationsRepository.hasIncompleteDocument).mockResolvedValue(true);

    await expect(verificationsService.submit(caller)).rejects.toMatchObject({
      code: 'validation_error',
      status: 422,
    });
    expect(verificationsRepository.submit).not.toHaveBeenCalled();
  });

  it('rejects repeated submission while verification is already pending', async () => {
    vi.mocked(verificationsRepository.findContextByOrganization).mockResolvedValue({
      ...context,
      application: {
        ...application,
        status: VERIFICATION_APPLICATION_STATUS.PENDING,
        submittedAt: new Date('2026-08-01T00:00:00.000Z'),
      },
    });

    await expect(verificationsService.submit(caller)).rejects.toMatchObject({
      code: 'invalid_transition',
      status: 409,
    });
    expect(verificationsRepository.submit).not.toHaveBeenCalled();
  });

  it('submits a rejected application through the guarded resubmission transition', async () => {
    const rejected = {
      ...application,
      status: VERIFICATION_APPLICATION_STATUS.REJECTED,
      submittedAt: new Date('2026-08-01T00:00:00.000Z'),
      reviewedAt: new Date('2026-08-02T00:00:00.000Z'),
    };
    vi.mocked(verificationsRepository.findContextByOrganization).mockResolvedValue({
      ...context,
      application: rejected,
    });
    vi.mocked(verificationsRepository.submit).mockResolvedValue({
      ...rejected,
      status: VERIFICATION_APPLICATION_STATUS.PENDING,
      attempt: 2,
    });

    await verificationsService.submit(caller);

    expect(verificationsRepository.submit).toHaveBeenCalledWith({
      applicationId: application.id,
      userId: caller.userId,
      expectedStatus: VERIFICATION_APPLICATION_STATUS.REJECTED,
    });
  });

  it('resubmits an expired approval through the guarded transition', async () => {
    const expired = {
      ...application,
      status: VERIFICATION_APPLICATION_STATUS.VERIFIED,
      submittedAt: new Date('2026-05-01T00:00:00.000Z'),
      reviewedAt: new Date('2026-05-02T00:00:00.000Z'),
      approvedAt: new Date('2026-05-02T00:00:00.000Z'),
      expiresAt: new Date('2026-07-02T00:00:00.000Z'),
    };
    vi.mocked(verificationsRepository.findContextByOrganization).mockResolvedValue({
      ...context,
      application: expired,
    });
    vi.mocked(verificationsRepository.submit).mockResolvedValue({
      ...expired,
      status: VERIFICATION_APPLICATION_STATUS.PENDING,
      attempt: 2,
      reviewedAt: null,
      approvedAt: null,
      expiresAt: null,
    });

    await verificationsService.submit(caller);

    expect(verificationsRepository.submit).toHaveBeenCalledWith({
      applicationId: application.id,
      userId: caller.userId,
      expectedStatus: VERIFICATION_APPLICATION_STATUS.VERIFIED,
    });
  });

  it('pins type and size into a private presigned upload', async () => {
    vi.mocked(verificationsRepository.reserveDocumentVersion).mockResolvedValue(document);

    const result = await verificationsService.createUpload(caller, {
      type: 'gst_registration_certificate',
      contentType: 'application/pdf',
      size: 1000,
    });

    expect(result).not.toHaveProperty('key');
    expect(result.uploadUrl).toBe('https://storage.test/upload');
  });

  it('restricts personal identity uploads to the organization owner', async () => {
    vi.mocked(verificationsRepository.findContextByOrganization).mockResolvedValue({
      ...context,
      ownerUserId: 'owner-2',
    });

    await expect(
      verificationsService.createUpload(caller, {
        type: 'personal_pan',
        contentType: 'application/pdf',
        size: 1000,
      }),
    ).rejects.toMatchObject({ status: 403 });
    expect(verificationsRepository.reserveDocumentVersion).not.toHaveBeenCalled();
  });

  it('removes the reservation when upload URL creation fails', async () => {
    vi.mocked(verificationsRepository.reserveDocumentVersion).mockResolvedValue(document);
    vi.mocked(presignUpload).mockRejectedValueOnce(new Error('storage unavailable'));

    await expect(
      verificationsService.createUpload(caller, {
        type: 'gst_registration_certificate',
        contentType: 'application/pdf',
        size: 1000,
      }),
    ).rejects.toThrow('storage unavailable');
    expect(verificationsRepository.cancelPendingDocument).toHaveBeenCalledWith(
      expect.any(String),
      'org-1',
    );
  });

  it('preserves the original presign error when reservation rollback also fails', async () => {
    vi.mocked(verificationsRepository.reserveDocumentVersion).mockResolvedValue(document);
    vi.mocked(presignUpload).mockRejectedValueOnce(new Error('storage unavailable'));
    vi.mocked(verificationsRepository.cancelPendingDocument).mockRejectedValueOnce(
      new Error('database unavailable'),
    );
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {
      throw new Error('logging unavailable');
    });

    try {
      await expect(
        verificationsService.createUpload(caller, {
          type: 'gst_registration_certificate',
          contentType: 'application/pdf',
          size: 1000,
        }),
      ).rejects.toThrow('storage unavailable');
      expect(consoleError).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });

  it('cancels only the original uploader pending reservation', async () => {
    const pendingDocument = {
      ...document,
      status: VERIFICATION_DOCUMENT_STATUS.PENDING_UPLOAD,
    };
    vi.mocked(verificationsRepository.findDocumentForOrganization).mockResolvedValue(
      pendingDocument,
    );
    vi.mocked(verificationsRepository.cancelPendingDocument).mockResolvedValue(pendingDocument);

    await verificationsService.removeDocument(caller, pendingDocument.id);

    expect(verificationsRepository.cancelPendingDocument).toHaveBeenCalledWith(
      pendingDocument.id,
      'org-1',
    );
    expect(deleteObject).toHaveBeenCalledWith(pendingDocument.objectKey);
  });

  it('commits a tenant-scoped upload and returns the refreshed state', async () => {
    const pendingDocument = {
      ...document,
      status: VERIFICATION_DOCUMENT_STATUS.PENDING_UPLOAD,
      committedAt: null,
    };
    vi.mocked(verificationsRepository.findDocumentForOrganization).mockResolvedValue(
      pendingDocument,
    );
    vi.mocked(verificationsRepository.commitDocument).mockResolvedValue(document);

    const result = await verificationsService.commitUpload(caller, pendingDocument.id);

    expect(verificationsRepository.commitDocument).toHaveBeenCalledWith(
      pendingDocument.id,
      'org-1',
    );
    expect(result.applicationId).toBe(application.id);
  });

  it('does not cancel another uploader pending reservation', async () => {
    vi.mocked(verificationsRepository.findDocumentForOrganization).mockResolvedValue({
      ...document,
      status: VERIFICATION_DOCUMENT_STATUS.PENDING_UPLOAD,
      uploadedByUserId: 'user-2',
    });

    await expect(verificationsService.removeDocument(caller, document.id)).rejects.toMatchObject({
      status: 403,
    });
    expect(verificationsRepository.cancelPendingDocument).not.toHaveBeenCalled();
    expect(deleteObject).not.toHaveBeenCalled();
  });

  it('removes a committed document while preserving its version record', async () => {
    const currentDocument = {
      ...document,
      id: '41cf6b87-80c0-4b47-82af-9c35f115bc7a',
      version: 2,
    };
    const removedDocument = {
      ...currentDocument,
      status: VERIFICATION_DOCUMENT_STATUS.REMOVED,
      removedAt: new Date('2026-08-13T00:00:00.000Z'),
      removedByUserId: caller.userId,
    };
    vi.mocked(verificationsRepository.findDocumentForOrganization).mockResolvedValue(
      currentDocument,
    );
    vi.mocked(verificationsRepository.removeCommittedDocument).mockResolvedValue(removedDocument);
    vi.mocked(verificationsRepository.listDocuments).mockResolvedValue([removedDocument, document]);

    const state = await verificationsService.removeDocument(caller, currentDocument.id);

    expect(verificationsRepository.removeCommittedDocument).toHaveBeenCalledWith(
      currentDocument.id,
      'org-1',
      caller.userId,
    );
    expect(deleteObject).not.toHaveBeenCalled();
    expect(state.documents).toEqual([]);
    expect(state.eligibility.businessDocumentPresent.met).toBe(false);
  });

  it('restricts removal of a personal identity document to the organization owner', async () => {
    vi.mocked(verificationsRepository.findDocumentForOrganization).mockResolvedValue({
      ...document,
      type: 'personal_pan',
    });
    vi.mocked(verificationsRepository.findContextByOrganization).mockResolvedValue({
      ...context,
      ownerUserId: 'owner-2',
    });

    await expect(verificationsService.removeDocument(caller, document.id)).rejects.toMatchObject({
      status: 403,
    });
    expect(verificationsRepository.removeCommittedDocument).not.toHaveBeenCalled();
    expect(deleteObject).not.toHaveBeenCalled();
  });

  it('restricts committing a personal identity document to the organization owner', async () => {
    vi.mocked(verificationsRepository.findDocumentForOrganization).mockResolvedValue({
      ...document,
      type: 'personal_pan',
      status: VERIFICATION_DOCUMENT_STATUS.PENDING_UPLOAD,
    });
    vi.mocked(verificationsRepository.findContextByOrganization).mockResolvedValue({
      ...context,
      ownerUserId: 'owner-2',
    });

    await expect(verificationsService.commitUpload(caller, document.id)).rejects.toMatchObject({
      status: 403,
    });
    expect(verificationsRepository.commitDocument).not.toHaveBeenCalled();
  });

  it('uses the dedicated short TTL for private verification document downloads', async () => {
    vi.mocked(verificationsRepository.findAdminDetail).mockResolvedValue({
      ...context,
      organizationName: 'Studio One Private Limited',
    });
    vi.mocked(verificationsRepository.findDocumentForOrganization).mockResolvedValue(document);

    await expect(
      verificationsService.downloadDocument(application.id, document.id),
    ).resolves.toEqual({ downloadUrl: 'https://storage.test/download' });
    expect(presignDownload).toHaveBeenCalledWith({
      key: document.objectKey,
      expiresIn: 60,
    });
  });

  it('serializes the selected admin queue tab and its lifecycle timestamps', async () => {
    const submittedAt = new Date('2026-08-10T00:00:00.000Z');
    const reviewedAt = new Date('2026-08-11T00:00:00.000Z');
    vi.mocked(verificationsRepository.listAdminQueue).mockResolvedValue({
      items: [
        {
          id: application.id,
          organizationId: 'org-1',
          organizationName: 'Studio One',
          designerName: 'Studio One',
          attempt: 1,
          status: VERIFICATION_APPLICATION_STATUS.VERIFIED,
          submittedAt,
          reviewedAt,
          documentCount: 1,
        },
      ],
      total: 1,
    });

    await expect(
      verificationsService.listAdmin({
        tab: ADMIN_VERIFICATION_QUEUE_TAB.ACCEPTED,
        page: 1,
        limit: 20,
      }),
    ).resolves.toMatchObject({
      tab: ADMIN_VERIFICATION_QUEUE_TAB.ACCEPTED,
      items: [
        {
          status: VERIFICATION_APPLICATION_STATUS.VERIFIED,
          submittedAt: submittedAt.toISOString(),
          reviewedAt: reviewedAt.toISOString(),
        },
      ],
    });
  });

  it('returns a validation error when approval eligibility is no longer met', async () => {
    vi.mocked(verificationsRepository.review).mockResolvedValue('ineligible');

    await expect(verificationsService.approve(application.id, 'reviewer-1')).rejects.toMatchObject({
      code: 'validation_error',
      status: 422,
    });
  });

  it('requires a note when admin requests changes at the contract boundary', async () => {
    const { rejectVerificationSchema } = await import('@repo/contracts');
    expect(rejectVerificationSchema.safeParse({ note: '  ' }).success).toBe(false);
  });
});
