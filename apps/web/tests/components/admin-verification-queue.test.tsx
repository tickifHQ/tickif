import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AdminVerificationDetailResponse,
  AdminVerificationQueueResponse,
} from '@repo/contracts';
import { AdminVerificationQueue } from '../../src/components/admin-verification-queue';

const mock = vi.hoisted(() => ({
  approve: vi.fn(),
  fetchDetail: vi.fn(),
  fetchDocumentUrl: vi.fn(),
  fetchQueue: vi.fn(),
  reject: vi.fn(),
}));

vi.mock('../../src/lib/admin-verification-api', () => ({
  approveAdminVerification: mock.approve,
  fetchAdminVerificationDetail: mock.fetchDetail,
  fetchAdminVerificationDocumentUrl: mock.fetchDocumentUrl,
  fetchAdminVerificationQueue: mock.fetchQueue,
  rejectAdminVerification: mock.reject,
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
      attempt: 2,
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
    attempt: 2,
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
  history: [
    {
      id: '33333333-3333-4333-8333-333333333333',
      attempt: 2,
      action: 'resubmitted',
      fromStatus: 'rejected',
      toStatus: 'pending',
      actorLabel: 'Designer',
      note: null,
      createdAt: '2026-09-01T10:00:00.000Z',
    },
  ],
};

describe('AdminVerificationQueue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.fetchDetail.mockResolvedValue(detail);
    mock.fetchQueue.mockResolvedValue({ ...queue, items: [], total: 0, totalPages: 0 });
    mock.fetchDocumentUrl.mockResolvedValue('https://storage.example.com/private-document');
    mock.approve.mockResolvedValue({
      ...detail,
      application: { ...detail.application, status: 'verified' },
    });
    mock.reject.mockResolvedValue({
      ...detail,
      application: { ...detail.application, status: 'rejected' },
    });
  });

  it('shows submitted designer verifications in FIFO order', () => {
    render(<AdminVerificationQueue initialQueue={queue} />);

    expect(screen.getByRole('heading', { name: 'Profile verification' })).toBeInTheDocument();
    expect(screen.getByText('Studio North')).toBeInTheDocument();
    expect(screen.getByText('Anika Sharma')).toBeInTheDocument();
    expect(screen.getByText('Attempt 2')).toBeInTheDocument();
    expect(screen.getByText(/oldest submission/i)).toBeInTheDocument();
  });

  it('opens the submitted application and allows the document to be reviewed', async () => {
    const user = userEvent.setup();
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(<AdminVerificationQueue initialQueue={queue} />);

    await user.click(screen.getByRole('button', { name: /open verification for studio north/i }));
    expect(await screen.findByText('GST registration certificate')).toBeInTheDocument();
    expect(screen.getByText('Phone verified')).toBeInTheDocument();
    expect(screen.getByText('3 of 3 approved')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /view gst registration certificate/i }));

    await waitFor(() => {
      expect(mock.fetchDocumentUrl).toHaveBeenCalledWith(applicationId, documentId);
      expect(open).toHaveBeenCalledWith(
        'https://storage.example.com/private-document',
        '_blank',
        'noopener,noreferrer',
      );
    });
  });

  it('confirms approval and removes the reviewed application from the pending queue', async () => {
    const user = userEvent.setup();
    render(<AdminVerificationQueue initialQueue={queue} />);

    await user.click(screen.getByRole('button', { name: /open verification for studio north/i }));
    await user.click(await screen.findByRole('button', { name: 'Approve verification' }));
    await user.click(screen.getByRole('button', { name: 'Confirm approval' }));

    await waitFor(() => expect(mock.approve).toHaveBeenCalledWith(applicationId));
    await waitFor(() => expect(mock.fetchQueue).toHaveBeenCalledWith(1));
  });

  it('keeps approval disabled when live eligibility is no longer met', async () => {
    const user = userEvent.setup();
    mock.fetchDetail.mockResolvedValue({
      ...detail,
      eligibility: {
        ...detail.eligibility,
        phoneVerified: { ...detail.eligibility.phoneVerified, met: false },
      },
    });
    render(<AdminVerificationQueue initialQueue={queue} />);

    await user.click(screen.getByRole('button', { name: /open verification for studio north/i }));

    expect(await screen.findByRole('button', { name: 'Approve verification' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Request changes' })).toBeEnabled();
  });

  it('requires feedback and sends selected documents when declining', async () => {
    const user = userEvent.setup();
    render(<AdminVerificationQueue initialQueue={queue} />);

    await user.click(screen.getByRole('button', { name: /open verification for studio north/i }));
    await user.click(await screen.findByRole('button', { name: 'Request changes' }));
    await user.click(screen.getByRole('button', { name: 'Send feedback' }));
    expect(await screen.findByText('Feedback is required.')).toBeInTheDocument();

    await user.type(
      screen.getByRole('textbox', { name: 'Feedback for the designer' }),
      'Upload a clearer certificate.',
    );
    await user.click(screen.getByRole('button', { name: 'Send feedback' }));

    await waitFor(() => {
      expect(mock.reject).toHaveBeenCalledWith(applicationId, {
        note: 'Upload a clearer certificate.',
        rejectedDocumentVersionIds: [documentId],
      });
    });
  });
});
