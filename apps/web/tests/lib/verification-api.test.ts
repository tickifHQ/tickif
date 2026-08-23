import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VerificationStateResponse } from '@repo/contracts';
import {
  fetchVerificationState,
  removeVerificationDocument,
  submitVerification,
  uploadVerificationDocument,
} from '../../src/lib/verification-api';

const mock = vi.hoisted(() => ({
  cancelDelete: vi.fn(),
  commitPost: vi.fn(),
  stateGet: vi.fn(),
  submitPost: vi.fn(),
  uploadPost: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  api: {
    api: {
      verifications: {
        $get: mock.stateGet,
        documents: {
          'upload-url': { $post: mock.uploadPost },
          ':versionId': {
            $delete: mock.cancelDelete,
            commit: { $post: mock.commitPost },
          },
        },
        submit: { $post: mock.submitPost },
      },
    },
  },
}));

const state: VerificationStateResponse = {
  applicationId: '11111111-1111-4111-8111-111111111111',
  status: 'draft',
  attempt: 1,
  identity: {
    ownerName: 'Anika Sharma',
    ownerPhone: '+919843211210',
    canEdit: true,
  },
  permissions: { canManage: true },
  eligibility: {
    eligible: true,
    phoneVerified: { met: true, label: 'Phone verified' },
    legalNamePresent: { met: true, label: 'Legal name present' },
    businessDocumentPresent: { met: true, label: 'Business document present' },
    publishedProjects: { met: true, label: 'Projects published', current: 3, required: 3 },
  },
  documents: [],
  history: [],
  latestNote: null,
  submittedAt: null,
  reviewedAt: null,
  approvedAt: null,
  expiresAt: null,
};

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body };
}

describe('verification-api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.cancelDelete.mockResolvedValue({ ok: true });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('loads and validates the active organization verification state', async () => {
    mock.stateGet.mockResolvedValue(jsonResponse(state));

    await expect(fetchVerificationState({ cookie: 'session=valid' })).resolves.toEqual(state);
    expect(mock.stateGet).toHaveBeenCalledWith({}, { headers: { cookie: 'session=valid' } });
  });

  it('presigns, uploads, and commits a private verification document', async () => {
    mock.uploadPost.mockResolvedValue(
      jsonResponse({
        documentVersionId: '22222222-2222-4222-8222-222222222222',
        uploadUrl: 'https://storage.example.com/private-upload',
      }),
    );
    mock.commitPost.mockResolvedValue(jsonResponse(state));
    const storageFetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', storageFetch);
    const file = new File(['document'], 'registration.pdf', { type: 'application/pdf' });

    await expect(uploadVerificationDocument('msme_udyam_registration', file)).resolves.toEqual(
      state,
    );
    expect(mock.uploadPost).toHaveBeenCalledWith({
      json: { type: 'msme_udyam_registration', contentType: 'application/pdf', size: file.size },
    });
    expect(storageFetch).toHaveBeenCalledWith('https://storage.example.com/private-upload', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/pdf' },
      body: file,
    });
    expect(mock.commitPost).toHaveBeenCalledWith({
      param: { versionId: '22222222-2222-4222-8222-222222222222' },
    });
  });

  it('does not reserve an unsupported file type', async () => {
    const file = new File(['document'], 'registration.gif', { type: 'image/gif' });

    await expect(uploadVerificationDocument('business_pan', file)).rejects.toThrow(
      'Upload a PDF, JPEG, or PNG file.',
    );
    expect(mock.uploadPost).not.toHaveBeenCalled();
  });

  it('does not commit when the storage upload fails', async () => {
    mock.uploadPost.mockResolvedValue(
      jsonResponse({
        documentVersionId: '22222222-2222-4222-8222-222222222222',
        uploadUrl: 'https://storage.example.com/private-upload',
      }),
    );
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));

    await expect(
      uploadVerificationDocument(
        'gst_registration_certificate',
        new File(['document'], 'registration.pdf', { type: 'application/pdf' }),
      ),
    ).rejects.toThrow('Could not upload the document.');
    expect(mock.commitPost).not.toHaveBeenCalled();
    expect(mock.cancelDelete).toHaveBeenCalledWith({
      param: { versionId: '22222222-2222-4222-8222-222222222222' },
    });
  });

  it('cleans up a reservation when committing the upload fails', async () => {
    mock.uploadPost.mockResolvedValue(
      jsonResponse({
        documentVersionId: '22222222-2222-4222-8222-222222222222',
        uploadUrl: 'https://storage.example.com/private-upload',
      }),
    );
    mock.commitPost.mockResolvedValue(jsonResponse({ error: { message: 'conflict' } }, false));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));

    await expect(
      uploadVerificationDocument(
        'gst_registration_certificate',
        new File(['document'], 'registration.pdf', { type: 'application/pdf' }),
      ),
    ).rejects.toThrow();
    expect(mock.cancelDelete).toHaveBeenCalledWith({
      param: { versionId: '22222222-2222-4222-8222-222222222222' },
    });
  });

  it('submits the server-authoritative application', async () => {
    mock.submitPost.mockResolvedValue(jsonResponse({ ...state, status: 'pending' }));

    await expect(submitVerification()).resolves.toMatchObject({ status: 'pending' });
    expect(mock.submitPost).toHaveBeenCalledTimes(1);
  });

  it('removes a committed verification document and validates the returned state', async () => {
    mock.cancelDelete.mockResolvedValue(jsonResponse({ ...state, documents: [] }));

    await expect(
      removeVerificationDocument('22222222-2222-4222-8222-222222222222'),
    ).resolves.toMatchObject({ documents: [] });
    expect(mock.cancelDelete).toHaveBeenCalledWith({
      param: { versionId: '22222222-2222-4222-8222-222222222222' },
    });
  });
});
