import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ParticipantReview, PublishedReviewsResponse } from '@repo/contracts';
import { ReviewEditor } from '../../src/components/review-editor';
import { TickifReviews } from '../../src/components/tickif-reviews';
import { DesignerReviews } from '../../src/components/designer-reviews';
import { UserFacingError } from '../../src/lib/user-facing-error';

const mock = vi.hoisted(() => ({
  submitReview: vi.fn(),
  editReview: vi.fn(),
  disputeReview: vi.fn(),
  fetchOwnReview: vi.fn(),
  fetchTickifReviews: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock('@/lib/reviews-api', () => mock);
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mock.refresh }) }));
const profileId = '11111111-1111-4111-8111-111111111111';
const own: ParticipantReview = {
  review: {
    id: '22222222-2222-4222-8222-222222222222',
    designerProfileId: profileId,
    author: { id: 'author', name: 'Reviewer', avatarUrl: null },
    project: null,
    bookingId: null,
    verifiedConsultation: false,
    rating: 4,
    body: 'Thoughtful design and attentive service throughout.',
    status: 'pending',
    moderationRevision: 2,
    publishedAt: null,
    disputedAt: null,
    createdAt: '2026-09-01T10:00:00Z',
    updatedAt: '2026-09-01T10:00:00Z',
  },
  canEdit: true,
  editableUntil: null,
  dispute: null,
  resolution: null,
};
const page: PublishedReviewsResponse = {
  items: [],
  histogram: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
  averageRating: 0,
  reviewCount: 0,
  page: 1,
  limit: 10,
  totalPages: 0,
};
beforeEach(() => vi.clearAllMocks());

describe('review submission and editing', () => {
  it('submits an optional rating-only review with a completed-booking reference', async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn().mockResolvedValue(undefined);
    const bookingId = '33333333-3333-4333-8333-333333333333';
    render(<ReviewEditor designerProfileId={profileId} bookingId={bookingId} onSaved={onSaved} />);
    await user.selectOptions(screen.getByLabelText('Your rating'), '3');
    await user.click(screen.getByRole('button', { name: 'Submit review' }));
    expect(mock.submitReview).toHaveBeenCalledWith({
      designerProfileId: profileId,
      bookingId,
      rating: 3,
      body: null,
    });
    expect(onSaved).toHaveBeenCalled();
  });
  it('validates short review text before sending', async () => {
    render(<ReviewEditor designerProfileId={profileId} onSaved={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Your experience (optional)'), {
      target: { value: 'Too short' },
    });
    fireEvent.submit(screen.getByRole('form'));
    expect(await screen.findByRole('alert')).toHaveTextContent('30–2,000');
    expect(mock.submitReview).not.toHaveBeenCalled();
  });
  it('retains edits and reports authoritative eligibility failures', async () => {
    const user = userEvent.setup();
    mock.submitReview.mockRejectedValue(
      new UserFacingError('Members cannot review their own designer organization'),
    );
    render(<ReviewEditor designerProfileId={profileId} onSaved={vi.fn()} />);
    await user.type(screen.getByLabelText('Your experience (optional)'), own.review.body!);
    await user.click(screen.getByRole('button', { name: 'Submit review' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('cannot review their own');
    expect(screen.getByLabelText('Your experience (optional)')).toHaveValue(own.review.body);
  });
  it('edits with the viewed revision and clears an optional body', async () => {
    const user = userEvent.setup();
    render(
      <ReviewEditor
        designerProfileId={profileId}
        existing={own}
        onSaved={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    await user.clear(screen.getByLabelText('Your experience (optional)'));
    await user.click(screen.getByRole('button', { name: 'Save review changes' }));
    expect(mock.editReview).toHaveBeenCalledWith(own.review.id, 2, { rating: 4, body: null });
  });
});

describe('Tickif review display', () => {
  it('shows private pending state and respects the server edit cutoff', () => {
    const view = render(
      <TickifReviews designerProfileId={profileId} initialPage={page} initialOwn={own} canWrite />,
    );
    expect(screen.getByText('pending')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit your review' })).toBeInTheDocument();
    view.unmount();
    render(
      <TickifReviews
        designerProfileId={profileId}
        initialPage={page}
        initialOwn={{ ...own, canEdit: false }}
        canWrite
      />,
    );
    expect(screen.queryByRole('button', { name: 'Edit your review' })).not.toBeInTheDocument();
  });
  it('paginates real published data without conflating Google ratings', async () => {
    const user = userEvent.setup();
    mock.fetchTickifReviews.mockResolvedValue({
      ...page,
      page: 2,
      totalPages: 2,
      reviewCount: 11,
      averageRating: 4,
      histogram: { 1: 0, 2: 0, 3: 0, 4: 11, 5: 0 },
      items: [{ ...own.review, status: 'published', publishedAt: own.review.createdAt }],
    });
    render(
      <TickifReviews
        designerProfileId={profileId}
        initialPage={{ ...page, totalPages: 2, reviewCount: 11 }}
        initialOwn={null}
        canWrite={false}
        loginHref="/login"
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Next reviews' }));
    expect(await screen.findByText('Reviewer')).toBeInTheDocument();
    expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
    expect(mock.fetchTickifReviews).toHaveBeenCalledWith(profileId, 2);
    expect(screen.getByLabelText('4 star reviews')).toHaveAttribute('value', '11');
  });
  it('shows read-only phone eligibility feedback without exposing an editor', () => {
    render(
      <TickifReviews
        designerProfileId={profileId}
        initialPage={page}
        initialOwn={null}
        canWrite={false}
        viewerMessage="A verified phone number is required."
      />,
    );
    expect(screen.getByText('A verified phone number is required.')).toBeInTheDocument();
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
  });
});

describe('designer disputes', () => {
  it('requires a reason, submits the viewed revision, and renders resolution feedback', async () => {
    const user = userEvent.setup();
    render(
      <DesignerReviews
        data={{
          items: [
            {
              ...own,
              review: { ...own.review, status: 'published' },
              canEdit: false,
              resolution: {
                decision: 'publish',
                note: 'Resolved fairly',
                createdAt: own.review.createdAt,
              },
            },
          ],
          page: 1,
          limit: 10,
          total: 1,
          totalPages: 1,
        }}
      />,
    );
    expect(screen.getByText(/Resolved fairly/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Dispute review' }));
    await user.type(screen.getByLabelText('Dispute reason'), 'The handover details are incorrect.');
    await user.click(screen.getByRole('button', { name: 'Submit dispute' }));
    expect(mock.disputeReview).toHaveBeenCalledWith(own.review.id, 2, {
      note: 'The handover details are incorrect.',
    });
    expect(await screen.findByRole('status')).toHaveTextContent('Dispute submitted');
    expect(mock.refresh).toHaveBeenCalled();
  });
});
