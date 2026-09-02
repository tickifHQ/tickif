import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ADMIN_VERIFICATION_QUEUE_TAB,
  type AdminVerificationDetailResponse,
  type AdminVerificationQueueResponse,
  type AdminVerificationQueueTab,
} from '@repo/contracts';
import { AdminVerificationQueue } from '../../src/components/admin-verification-queue';

const mock = vi.hoisted(() => ({
  approve: vi.fn(),
  fetchDetail: vi.fn(),
  fetchDocumentUrl: vi.fn(),
  fetchQueue: vi.fn(),
  reject: vi.fn(),
  revoke: vi.fn(),
}));

vi.mock('../../src/lib/admin-verification-api', () => ({
  approveAdminVerification: mock.approve,
  fetchAdminVerificationDetail: mock.fetchDetail,
  fetchAdminVerificationDocumentUrl: mock.fetchDocumentUrl,
  fetchAdminVerificationQueue: mock.fetchQueue,
  rejectAdminVerification: mock.reject,
  revokeAdminVerification: mock.revoke,
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
      status: 'pending',
      submittedAt: '2026-09-01T10:00:00.000Z',
      reviewedAt: null,
      documentCount: 2,
    },
  ],
  page: 1,
  limit: 20,
  total: 1,
  totalPages: 1,
  tab: 'new',
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
    mock.revoke.mockResolvedValue({
      ...detail,
      application: { ...detail.application, status: 'pending', attempt: 3 },
    });
  });

  it('shows submitted designer verifications in FIFO order', () => {
    render(<AdminVerificationQueue initialQueue={queue} />);

    expect(screen.getByRole('heading', { name: 'Profile verification' })).toBeInTheDocument();
    expect(screen.getByText('Studio North')).toBeInTheDocument();
    expect(screen.getByText('Anika Sharma')).toBeInTheDocument();
    expect(screen.getByText('Attempt 1')).toBeInTheDocument();
    expect(screen.getByText(/oldest submission/i)).toBeInTheDocument();
  });

  it('shows every verification queue count before inactive queues are loaded', () => {
    render(
      <AdminVerificationQueue
        initialQueue={queue}
        initialCounts={{ new: 1, re_review: 2, accepted: 7, changes_requested: 3 }}
      />,
    );

    expect(within(screen.getByRole('tab', { name: /new/i })).getByText('1')).toBeVisible();
    expect(within(screen.getByRole('tab', { name: /re-review/i })).getByText('2')).toBeVisible();
    expect(within(screen.getByRole('tab', { name: /accepted/i })).getByText('7')).toBeVisible();
    expect(
      within(screen.getByRole('tab', { name: /changes requested/i })).getByText('3'),
    ).toBeVisible();
    expect(mock.fetchQueue).not.toHaveBeenCalled();
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
    let resolveQueueRefresh!: (value: AdminVerificationQueueResponse) => void;
    mock.fetchQueue.mockImplementation(
      () =>
        new Promise<AdminVerificationQueueResponse>((resolve) => {
          resolveQueueRefresh = resolve;
        }),
    );
    render(<AdminVerificationQueue initialQueue={queue} />);

    await user.click(screen.getByRole('button', { name: /open verification for studio north/i }));
    await user.click(await screen.findByRole('button', { name: 'Approve verification' }));
    await user.click(screen.getByRole('button', { name: 'Confirm approval' }));

    await waitFor(() => expect(mock.approve).toHaveBeenCalledWith(applicationId));
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Profile verification review' }),
      ).not.toBeInTheDocument(),
    );
    expect(screen.queryByText('Studio North')).not.toBeInTheDocument();
    expect(screen.getByText('No new verifications')).toBeInTheDocument();
    await waitFor(() =>
      expect(mock.fetchQueue).toHaveBeenCalledWith(ADMIN_VERIFICATION_QUEUE_TAB.NEW, 1),
    );
    resolveQueueRefresh({ ...queue, items: [], total: 0, totalPages: 0 });
    expect(await screen.findByText('No new verifications')).toBeInTheDocument();
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

  it('moves an approved re-review application into an already loaded accepted queue', async () => {
    const user = userEvent.setup();
    let approved = false;
    const reReviewQueue: AdminVerificationQueueResponse = {
      ...queue,
      tab: ADMIN_VERIFICATION_QUEUE_TAB.RE_REVIEW,
      items: queue.items.map((item) => ({ ...item, attempt: 3 })),
    };
    const acceptedItem = {
      ...queue.items[0]!,
      attempt: 3,
      status: 'verified' as const,
      reviewedAt: '2026-09-02T10:00:00.000Z',
    };
    mock.approve.mockImplementation(async () => {
      approved = true;
      return {
        ...detail,
        application: { ...detail.application, status: 'verified' as const },
      };
    });
    mock.fetchQueue.mockImplementation(async (tab: AdminVerificationQueueTab) => {
      if (tab === ADMIN_VERIFICATION_QUEUE_TAB.ACCEPTED) {
        return {
          ...queue,
          tab,
          items: approved ? [acceptedItem] : [],
          total: approved ? 1 : 0,
          totalPages: approved ? 1 : 0,
        };
      }
      return { ...queue, tab, items: [], total: 0, totalPages: 0 };
    });
    render(<AdminVerificationQueue initialQueue={reReviewQueue} />);

    await user.click(screen.getByRole('tab', { name: /accepted/i }));
    expect(await screen.findByText('No accepted verifications')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: /re-review/i }));
    await user.click(screen.getByRole('button', { name: /open verification for studio north/i }));
    await user.click(await screen.findByRole('button', { name: 'Approve verification' }));
    await user.click(screen.getByRole('button', { name: 'Confirm approval' }));

    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Profile verification review' }),
      ).not.toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(mock.fetchQueue).toHaveBeenCalledWith(ADMIN_VERIFICATION_QUEUE_TAB.ACCEPTED, 1),
    );
    await user.click(screen.getByRole('tab', { name: /accepted/i }));
    expect(await screen.findByText('Studio North')).toBeInTheDocument();
    expect(screen.getByText('Verified')).toBeInTheDocument();
  });

  it('loads every lifecycle tab from the server and renders its empty state', async () => {
    const user = userEvent.setup();
    mock.fetchQueue.mockImplementation(async (tab: AdminVerificationQueueTab) => ({
      ...queue,
      items: [],
      total: 0,
      totalPages: 0,
      tab,
    }));
    render(<AdminVerificationQueue initialQueue={queue} />);

    const tabs = [
      {
        tab: ADMIN_VERIFICATION_QUEUE_TAB.RE_REVIEW,
        name: /re-review/i,
        emptyState: 'No verifications awaiting re-review',
      },
      {
        tab: ADMIN_VERIFICATION_QUEUE_TAB.ACCEPTED,
        name: /accepted/i,
        emptyState: 'No accepted verifications',
      },
      {
        tab: ADMIN_VERIFICATION_QUEUE_TAB.CHANGES_REQUESTED,
        name: /changes requested/i,
        emptyState: 'No changes requested',
      },
    ];

    for (const { tab, name, emptyState } of tabs) {
      await user.click(screen.getByRole('tab', { name }));
      await waitFor(() => expect(mock.fetchQueue).toHaveBeenCalledWith(tab, 1));
      expect(await screen.findByText(emptyState)).toBeInTheDocument();
    }
  });

  it('keeps the lifecycle tabs horizontally scrollable on narrow screens', () => {
    render(<AdminVerificationQueue initialQueue={queue} />);

    expect(
      screen.getByRole('tablist', { name: 'Profile verification queues' }).parentElement,
    ).toHaveClass('overflow-x-auto');
  });

  it('moves forward and backward through a multi-page lifecycle queue', async () => {
    const user = userEvent.setup();
    const firstPage: AdminVerificationQueueResponse = {
      ...queue,
      total: 21,
      totalPages: 2,
    };
    const secondPage: AdminVerificationQueueResponse = {
      ...firstPage,
      page: 2,
      items: [
        {
          ...queue.items[0]!,
          id: '44444444-4444-4444-8444-444444444444',
          organizationId: 'organization-2',
          organizationName: 'Studio South',
          designerName: 'Meera Rao',
        },
      ],
    };
    mock.fetchQueue.mockImplementation(async (_tab: AdminVerificationQueueTab, page: number) =>
      page === 2 ? secondPage : firstPage,
    );
    render(<AdminVerificationQueue initialQueue={firstPage} />);

    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Next' }));

    expect(await screen.findByText('Studio South')).toBeInTheDocument();
    expect(mock.fetchQueue).toHaveBeenLastCalledWith(ADMIN_VERIFICATION_QUEUE_TAB.NEW, 2);
    expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Previous' }));

    expect(await screen.findByText('Studio North')).toBeInTheDocument();
    expect(mock.fetchQueue).toHaveBeenLastCalledWith(ADMIN_VERIFICATION_QUEUE_TAB.NEW, 1);
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
  });

  it('keeps accepted verification history protected from pending-only actions', async () => {
    const user = userEvent.setup();
    const acceptedQueue: AdminVerificationQueueResponse = {
      ...queue,
      tab: ADMIN_VERIFICATION_QUEUE_TAB.ACCEPTED,
      items: [
        {
          ...queue.items[0]!,
          status: 'verified',
          reviewedAt: '2026-09-02T10:00:00.000Z',
        },
      ],
    };
    mock.fetchQueue.mockResolvedValue(acceptedQueue);
    mock.fetchDetail.mockResolvedValue({
      ...detail,
      application: {
        ...detail.application,
        status: 'verified',
        reviewedAt: '2026-09-02T10:00:00.000Z',
        approvedAt: '2026-09-02T10:00:00.000Z',
        expiresAt: '2026-11-02T10:00:00.000Z',
      },
      documents: detail.documents.map((document) => ({ ...document, status: 'verified' })),
    });
    render(<AdminVerificationQueue initialQueue={queue} />);

    await user.click(screen.getByRole('tab', { name: /accepted/i }));
    await user.click(
      await screen.findByRole('button', { name: /open verification for studio north/i }),
    );

    expect(await screen.findAllByText('Verified')).not.toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Approve verification' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Request changes' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Revoke approval' })).toBeEnabled();
  });

  it('requires a reason and moves a revoked approval into re-review', async () => {
    const user = userEvent.setup();
    let revoked = false;
    const acceptedItem = {
      ...queue.items[0]!,
      status: 'verified' as const,
      reviewedAt: '2026-09-02T10:00:00.000Z',
    };
    const acceptedQueue: AdminVerificationQueueResponse = {
      ...queue,
      tab: ADMIN_VERIFICATION_QUEUE_TAB.ACCEPTED,
      items: [acceptedItem],
    };
    const verifiedDetail: AdminVerificationDetailResponse = {
      ...detail,
      application: {
        ...detail.application,
        status: 'verified',
        reviewedAt: '2026-09-02T10:00:00.000Z',
        approvedAt: '2026-09-02T10:00:00.000Z',
        expiresAt: '2026-11-02T10:00:00.000Z',
      },
      documents: detail.documents.map((document) => ({ ...document, status: 'verified' })),
    };
    mock.fetchDetail.mockResolvedValue(verifiedDetail);
    mock.revoke.mockImplementation(async () => {
      revoked = true;
      return {
        ...verifiedDetail,
        application: {
          ...verifiedDetail.application,
          status: 'pending' as const,
          attempt: 3,
          reviewedAt: null,
          approvedAt: null,
          expiresAt: null,
        },
      };
    });
    mock.fetchQueue.mockImplementation(async (tab: AdminVerificationQueueTab) => {
      if (tab === ADMIN_VERIFICATION_QUEUE_TAB.RE_REVIEW) {
        return {
          ...queue,
          tab,
          items: revoked
            ? [
                {
                  ...acceptedItem,
                  status: 'pending' as const,
                  attempt: 3,
                  reviewedAt: null,
                },
              ]
            : [],
          total: revoked ? 1 : 0,
          totalPages: revoked ? 1 : 0,
        };
      }
      return { ...acceptedQueue, items: revoked ? [] : [acceptedItem], total: revoked ? 0 : 1 };
    });
    render(<AdminVerificationQueue initialQueue={acceptedQueue} />);

    await user.click(screen.getByRole('button', { name: /open verification for studio north/i }));
    await user.click(await screen.findByRole('button', { name: 'Revoke approval' }));
    await user.click(screen.getByRole('button', { name: 'Confirm revocation' }));
    expect(await screen.findByText('A reason for revocation is required.')).toBeInTheDocument();

    await user.type(
      screen.getByRole('textbox', { name: 'Reason for revocation' }),
      'The identity evidence needs another review.',
    );
    await user.click(screen.getByRole('button', { name: 'Confirm revocation' }));

    await waitFor(() =>
      expect(mock.revoke).toHaveBeenCalledWith(applicationId, {
        note: 'The identity evidence needs another review.',
      }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Profile verification review' }),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByText('No accepted verifications')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /re-review/i }));
    expect(await screen.findByText('Studio North')).toBeInTheDocument();
    expect(screen.getByText('Attempt 3')).toBeInTheDocument();
  });

  it('does not render a queue response for the wrong lifecycle tab', async () => {
    const user = userEvent.setup();
    mock.fetchQueue.mockResolvedValue(queue);
    render(<AdminVerificationQueue initialQueue={queue} />);

    await user.click(screen.getByRole('tab', { name: /accepted/i }));

    expect(await screen.findByText('Could not load this queue.')).toBeInTheDocument();
    expect(screen.getByText('No accepted verifications')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /new/i }));
    expect(screen.queryByText('Could not load this queue.')).not.toBeInTheDocument();
    expect(screen.getByText('Studio North')).toBeInTheDocument();
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
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Profile verification review' }),
      ).not.toBeInTheDocument(),
    );
  });
});
