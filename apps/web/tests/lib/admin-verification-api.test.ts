import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AdminVerificationDetailResponse,
  AdminVerificationQueueResponse,
} from '@repo/contracts';
import {
  approveAdminVerification,
  fetchAdminVerificationDetail,
  fetchAdminVerificationDocumentUrl,
  fetchAdminVerificationQueue,
  rejectAdminVerification,
} from '../../src/lib/admin-verification-api';

const mock = vi.hoisted(() => ({
  approvePost: vi.fn(),
  detailGet: vi.fn(),
  documentGet: vi.fn(),
  queueGet: vi.fn(),
  rejectPost: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  api: {
    api: {
      admin: {
        verifications: {
          $get: mock.queueGet,
          ':id': {
            $get: mock.detailGet,
            approve: { $post: mock.approvePost },
            documents: {
              ':versionId': { download: { $get: mock.documentGet } },
            },
            reject: { $post: mock.rejectPost },
          },
        },
      },
    },
  },
}));

const applicationId = '11111111-1111-4111-8111-111111111111';
const documentId = '22222222-2222-4222-8222-222222222222';

const queue: AdminVerificationQueueResponse = {
  items: [
    {
      id: applicationId,
      organizationId: 'organization-1',
      organizationName: 'Studio North',
      designerName: 'Anika Sharma',
      attempt: 1,
      submittedAt: '2026-09-01T10:00:00.000Z',
      documentCount: 2,
    },
  ],
  page: 1,
  limit: 20,
  total: 1,
  totalPages: 1,
};

const detail: AdminVerificationDetailResponse = {
  application: {
    id: applicationId,
    organizationId: 'organization-1',
    organizationName: 'Studio North',
    designerName: 'Anika Sharma',
    ownerName: 'Anika Sharma',
    ownerEmail: 'anika@example.com',
    ownerPhone: '+919876543210',
    status: 'pending',
    attempt: 1,
    submittedAt: '2026-09-01T10:00:00.000Z',
    reviewedAt: null,
    approvedAt: null,
    expiresAt: null,
  },
  eligibility: {
    phoneVerified: { met: true, label: 'Verify the account owner phone number' },
    publishedProjects: {
      met: true,
      label: 'Publish at least 3 projects',
      current: 3,
      required: 3,
    },
  },
  documents: [
    {
      id: documentId,
      type: 'gst_registration_certificate',
      version: 1,
      status: 'uploaded',
      contentType: 'application/pdf',
      size: 1024,
      committedAt: '2026-09-01T09:59:00.000Z',
      createdAt: '2026-09-01T09:58:00.000Z',
    },
  ],
  history: [],
};

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body };
}

describe('admin-verification-api', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loads and validates the pending verification queue for SSR', async () => {
    mock.queueGet.mockResolvedValue(jsonResponse(queue));

    await expect(
      fetchAdminVerificationQueue(1, { headers: { cookie: 'session=valid' } }),
    ).resolves.toEqual(queue);
    expect(mock.queueGet).toHaveBeenCalledWith(
      { query: { page: '1', limit: '20' } },
      { headers: { cookie: 'session=valid' } },
    );
  });

  it('loads an application and obtains only a short-lived document URL', async () => {
    mock.detailGet.mockResolvedValue(jsonResponse(detail));
    mock.documentGet.mockResolvedValue(
      jsonResponse({ downloadUrl: 'https://storage.example.com/private-document' }),
    );

    await expect(fetchAdminVerificationDetail(applicationId)).resolves.toEqual(detail);
    await expect(fetchAdminVerificationDocumentUrl(applicationId, documentId)).resolves.toBe(
      'https://storage.example.com/private-document',
    );
    expect(mock.documentGet).toHaveBeenCalledWith({
      param: { id: applicationId, versionId: documentId },
    });
  });

  it('approves or requests changes through the protected review endpoints', async () => {
    mock.approvePost.mockResolvedValue(
      jsonResponse({
        ...detail,
        application: { ...detail.application, status: 'verified' },
      }),
    );
    mock.rejectPost.mockResolvedValue(
      jsonResponse({
        ...detail,
        application: { ...detail.application, status: 'rejected' },
      }),
    );

    await expect(approveAdminVerification(applicationId)).resolves.toMatchObject({
      application: { status: 'verified' },
    });
    await expect(
      rejectAdminVerification(applicationId, {
        note: 'Upload a clearer certificate.',
        rejectedDocumentVersionIds: [documentId],
      }),
    ).resolves.toMatchObject({ application: { status: 'rejected' } });
    expect(mock.rejectPost).toHaveBeenCalledWith({
      param: { id: applicationId },
      json: {
        note: 'Upload a clearer certificate.',
        rejectedDocumentVersionIds: [documentId],
      },
    });
  });
});
