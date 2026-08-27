import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
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
  },
  hasBusinessDocument: vi.fn((documents: Array<{ type: string; status: string }>) =>
    documents.some(
      (document) =>
        document.type === 'gst_registration_certificate' &&
        ['uploaded', 'verified'].includes(document.status),
    ),
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
    submit: vi.fn(),
    listPending: vi.fn(),
    findAdminDetail: vi.fn(),
    review: vi.fn(),
  },
}));

const { verificationsService } = await import('../../../src/modules/verifications/service.js');
const { verificationsRepository } =
  await import('../../../src/modules/verifications/repository.js');
const { presignDownload } = await import('@repo/storage');

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
  createdAt: new Date('2026-08-01T00:00:00.000Z'),
};

const caller = { userId: 'user-1', activeOrgId: 'org-1' };

describe('verificationsService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-13T00:00:00.000Z'));
    vi.clearAllMocks();
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
    expect(result.eligibility.eligible).toBe(true);
    expect(result.eligibility.publishedProjects).toMatchObject({ current: 3, required: 3 });
    expect(result.documents).toHaveLength(1);
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

  it('requires a note when admin requests changes at the contract boundary', async () => {
    const { rejectVerificationSchema } = await import('@repo/contracts');
    expect(rejectVerificationSchema.safeParse({ note: '  ' }).success).toBe(false);
  });
});
