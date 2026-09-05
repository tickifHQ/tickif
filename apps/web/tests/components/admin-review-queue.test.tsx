import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminReviewDetailResponse, AdminReviewsResponse } from '@repo/contracts';
import { AdminReviewQueue } from '../../src/components/admin-review-queue';

const mocks = vi.hoisted(() => ({
  detail: vi.fn(),
  queue: vi.fn(),
  publish: vi.fn(),
  reject: vi.fn(),
  resolve: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
}));
vi.mock('../../src/lib/admin-review-api', () => ({
  fetchAdminReview: mocks.detail,
  fetchAdminReviews: mocks.queue,
  publishAdminReview: mocks.publish,
  rejectAdminReview: mocks.reject,
  resolveAdminReview: mocks.resolve,
}));
const detail: AdminReviewDetailResponse = {
  review: {
    id: '11111111-1111-4111-8111-111111111111',
    designerProfileId: '22222222-2222-4222-8222-222222222222',
    author: { id: 'author', name: 'Asha', avatarUrl: null },
    project: null,
    bookingId: null,
    verifiedConsultation: false,
    rating: 5,
    body: 'The studio made the process clear and the result is beautiful.',
    status: 'pending',
    moderationRevision: 2,
    publishedAt: null,
    disputedAt: null,
    createdAt: '2026-09-01T10:00:00Z',
    updatedAt: '2026-09-01T10:00:00Z',
  },
  designer: { id: '22222222-2222-4222-8222-222222222222', name: 'Studio North' },
  history: [],
};
const queue: AdminReviewsResponse = {
  items: [detail.review],
  page: 1,
  limit: 20,
  total: 1,
  totalPages: 1,
};
async function openReview() {
  await userEvent.click(screen.getByRole('button', { name: 'Review feedback by Asha' }));
  await screen.findByText('Studio North');
}

describe('AdminReviewQueue', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.detail.mockResolvedValue(detail);
    mocks.queue.mockResolvedValue({ ...queue, items: [], total: 0, totalPages: 0 });
  });
  it('requires a rejection reason and note, then removes the decided review', async () => {
    render(<AdminReviewQueue initialQueue={queue} status="pending" />);
    await openReview();
    await userEvent.click(screen.getByRole('button', { name: 'Reject review' }));
    expect(mocks.reject).not.toHaveBeenCalled();
    await userEvent.type(screen.getByLabelText('Rejection reason code'), 'spam');
    await userEvent.type(
      screen.getByLabelText('Rejection note (required to reject)'),
      'Promotional content',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Reject review' }));
    await screen.findByText('Review decision saved.');
    expect(mocks.reject).toHaveBeenCalledWith(detail.review.id, 2, {
      reasonCode: 'spam',
      note: 'Promotional content',
    });
    expect(
      screen.queryByRole('button', { name: 'Review feedback by Asha' }),
    ).not.toBeInTheDocument();
  });
  it('blocks repeated decisions after a conflict until details are refreshed', async () => {
    mocks.publish.mockRejectedValue(
      new Error('This review changed. Refresh the details before deciding again.'),
    );
    render(<AdminReviewQueue initialQueue={queue} status="pending" />);
    await openReview();
    await userEvent.click(screen.getByRole('button', { name: 'Publish review' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Publish review' })).toBeDisabled(),
    );
    mocks.detail.mockResolvedValue({
      ...detail,
      review: { ...detail.review, moderationRevision: 3 },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Refresh details' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Publish review' })).toBeEnabled(),
    );
    mocks.publish.mockResolvedValue(undefined);
    await userEvent.click(screen.getByRole('button', { name: 'Publish review' }));
    await waitFor(() => expect(mocks.publish).toHaveBeenLastCalledWith(detail.review.id, 3));
  });
  it.each(['Resolve and publish', 'Resolve and remove'])(
    'requires a note for %s and shows dispute context',
    async (label) => {
      mocks.detail.mockResolvedValue({
        ...detail,
        review: { ...detail.review, status: 'disputed' },
        history: [
          {
            id: 'event',
            action: 'dispute',
            note: 'Wrong project described',
            reasonCode: null,
            createdAt: detail.review.createdAt,
            actorUserId: 'owner',
            fromStatus: 'published',
            toStatus: 'disputed',
          },
        ],
      });
      render(<AdminReviewQueue initialQueue={queue} status="disputed" />);
      await openReview();
      expect(screen.getByText('Wrong project described')).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: label }));
      expect(mocks.resolve).not.toHaveBeenCalled();
      await userEvent.type(screen.getByLabelText('Resolution note (required)'), 'Evidence checked');
      await userEvent.click(screen.getByRole('button', { name: label }));
      await waitFor(() =>
        expect(mocks.resolve).toHaveBeenCalledWith(detail.review.id, 2, {
          decision: label.endsWith('publish') ? 'publish' : 'remove',
          note: 'Evidence checked',
        }),
      );
    },
  );
  it('keeps queue status when navigating beyond the first page', async () => {
    render(
      <AdminReviewQueue
        initialQueue={{ ...queue, total: 41, totalPages: 3, page: 2 }}
        status="disputed"
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(mocks.push).toHaveBeenCalledWith('/review-moderation?status=disputed&page=3');
    await userEvent.click(screen.getByRole('button', { name: 'Previous' }));
    expect(mocks.push).toHaveBeenCalledWith('/review-moderation?status=disputed&page=1');
  });
  it('returns to the last valid page after deciding its final review', async () => {
    mocks.queue.mockResolvedValue({ ...queue, page: 2, items: [], total: 20, totalPages: 1 });
    render(
      <AdminReviewQueue
        initialQueue={{ ...queue, page: 2, total: 21, totalPages: 2 }}
        status="pending"
      />,
    );
    await openReview();
    await userEvent.click(screen.getByRole('button', { name: 'Publish review' }));
    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith('/review-moderation?status=pending&page=1'),
    );
  });
});
