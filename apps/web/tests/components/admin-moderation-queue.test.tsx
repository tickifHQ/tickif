import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminModerationDetailResponse, AdminModerationQueueResponse } from '@repo/contracts';
import { AdminModerationQueue } from '../../src/components/admin-moderation-queue';

const mocks = vi.hoisted(() => ({
  fetchQueue: vi.fn(),
  fetchDetail: vi.fn(),
  startReview: vi.fn(),
  publish: vi.fn(),
  requestChanges: vi.fn(),
  reject: vi.fn(),
  unpublish: vi.fn(),
  correct: vi.fn(),
  createComment: vi.fn(),
  updateComment: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
}));

vi.mock('../../src/lib/admin-moderation-api', () => ({
  ADMIN_MODERATION_QUEUE_TABS: ['submitted', 'in_review', 'published'],
  fetchAdminModerationQueue: mocks.fetchQueue,
  fetchAdminModerationDetail: mocks.fetchDetail,
  startAdminReview: mocks.startReview,
  publishAdminProject: mocks.publish,
  requestAdminChanges: mocks.requestChanges,
  rejectAdminProject: mocks.reject,
  unpublishAdminProject: mocks.unpublish,
  correctAdminProject: mocks.correct,
  createAdminReviewComment: mocks.createComment,
  updateAdminReviewComment: mocks.updateComment,
}));

const projectId = '11111111-1111-4111-8111-111111111111';
const designerId = '22222222-2222-4222-8222-222222222222';
const roomId = '33333333-3333-4333-8333-333333333333';
const imageId = '44444444-4444-4444-8444-444444444444';
const comment = {
  id: '66666666-6666-4666-8666-666666666666',
  projectId,
  authorLabel: 'Tickif Review Team' as const,
  body: 'Please add a clear kitchen photo.',
  status: 'unresolved' as const,
  createdAt: '2026-08-03T10:00:00.000Z',
  updatedAt: '2026-08-03T10:00:00.000Z',
};

const queue: AdminModerationQueueResponse = {
  items: [
    {
      id: projectId,
      title: 'A calm coastal home',
      status: 'submitted',
      designerName: 'Studio North',
      submittedAt: '2026-08-03T10:00:00.000Z',
      reviewedBy: null,
      imageCount: 4,
      completeness: {
        complete: true,
        score: 100,
        missing: [],
        requirements: [],
      },
    },
  ],
  page: 1,
  limit: 20,
  total: 1,
  totalPages: 1,
};

function detail(
  overrides: Partial<AdminModerationDetailResponse['project']> = {},
): AdminModerationDetailResponse {
  return {
    project: {
      id: projectId,
      designerId,
      designerName: 'Studio North',
      title: 'A calm coastal home',
      slug: 'a-calm-coastal-home',
      status: 'submitted',
      description: 'A considered home for a young family.',
      propertyTypeSlug: 'residential',
      propertySubtypeSlug: null,
      scopeSlug: 'full-home',
      bhkSlug: '3-bhk',
      sizeSqft: 1800,
      citySlug: 'mumbai',
      localitySlug: 'bandra',
      buildingName: null,
      budgetBandSlug: 'premium',
      coverImageId: imageId,
      completedMonth: '2026-05',
      durationMonths: 5,
      metadata: { style: 'coastal' },
      submittedAt: '2026-08-03T10:00:00.000Z',
      publishedAt: null,
      reviewedBy: null,
      reviewStartedAt: null,
      rejectionReasonCode: null,
      moderationNote: null,
      featuredAt: null,
      createdAt: '2026-07-01T10:00:00.000Z',
      updatedAt: '2026-08-03T10:00:00.000Z',
      ...overrides,
    },
    rooms: [
      {
        id: roomId,
        projectId,
        roomTypeId: '55555555-5555-4555-8555-555555555555',
        name: 'Living room',
        description: 'Soft textures and natural light.',
        sortOrder: 0,
        metadata: {},
        createdAt: '2026-07-01T10:00:00.000Z',
        updatedAt: '2026-07-01T10:00:00.000Z',
      },
    ],
    images: [
      {
        id: imageId,
        roomId,
        originalUrl: 'https://cdn.example.com/image.jpg',
        status: 'ready',
        themeSlugs: ['coastal'],
        materialSlugs: ['oak'],
        finishSlugs: [],
        tagSlugs: ['living-room'],
        width: 1600,
        height: 1200,
        sortOrder: 0,
        duplicate: null,
      },
    ],
    completeness: {
      complete: true,
      score: 100,
      missing: [],
      requirements: [
        { key: 'project-name', label: 'Project name', complete: true },
        { key: 'at-least-three-photos', label: 'At least 3 photos', complete: true },
      ],
    },
    history: [],
    reviewComments: [],
  };
}

function renderQueue(currentUserId = 'admin-1') {
  return render(
    <AdminModerationQueue
      initialQueue={queue}
      initialCounts={{ submitted: 1, in_review: 4, published: 9 }}
      currentUserId={currentUserId}
      currentUserRole="admin"
    />,
  );
}

describe('AdminModerationQueue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchQueue.mockResolvedValue({ ...queue, items: [], total: 0, totalPages: 0 });
    mocks.fetchDetail.mockResolvedValue(detail());
    mocks.startReview.mockResolvedValue(detail({ status: 'in_review', reviewedBy: 'admin-1' }));
    mocks.correct.mockResolvedValue(detail());
    mocks.createComment.mockResolvedValue(comment);
    mocks.updateComment.mockResolvedValue({ ...comment, status: 'resolved' });
  });

  it('shows the FIFO queue and oldest submission indicator', () => {
    renderQueue();

    expect(screen.getByRole('heading', { name: 'Moderation queue' })).toBeInTheDocument();
    expect(screen.getByText('A calm coastal home')).toBeInTheDocument();
    expect(screen.getByText(/oldest submission/i)).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /submitted/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /in review by me/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /published/i })).toBeInTheDocument();
  });

  it('shows every moderation queue count before inactive queues are loaded', () => {
    renderQueue();

    expect(within(screen.getByRole('tab', { name: /submitted/i })).getByText('1')).toBeVisible();
    expect(
      within(screen.getByRole('tab', { name: /in review by me/i })).getByText('4'),
    ).toBeVisible();
    expect(within(screen.getByRole('tab', { name: /published/i })).getByText('9')).toBeVisible();
    expect(mocks.fetchQueue).not.toHaveBeenCalled();
  });

  it('claims a submission and then enables the current admin review actions', async () => {
    const user = userEvent.setup();
    renderQueue();

    await user.click(screen.getByRole('button', { name: /open review for a calm coastal home/i }));
    await screen.findByRole('button', { name: /start review/i });
    await user.click(screen.getByRole('button', { name: /start review/i }));

    await waitFor(() => expect(mocks.startReview).toHaveBeenCalledWith(projectId));
    expect(await screen.findByRole('button', { name: 'Approve' })).toBeEnabled();
  });

  it('disables actions when another admin owns the review claim', async () => {
    const user = userEvent.setup();
    mocks.fetchDetail.mockResolvedValue(detail({ status: 'in_review', reviewedBy: 'admin-2' }));
    renderQueue();

    await user.click(screen.getByRole('button', { name: /open review for a calm coastal home/i }));

    expect(await screen.findByText(/another admin/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /edit project title/i })).toBeDisabled();
  });

  it('requires a note before requesting changes', async () => {
    const user = userEvent.setup();
    mocks.fetchDetail.mockResolvedValue(detail({ status: 'in_review', reviewedBy: 'admin-1' }));
    renderQueue();

    await user.click(screen.getByRole('button', { name: /open review for a calm coastal home/i }));
    await user.click(await screen.findByRole('button', { name: 'Request changes' }));
    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(await screen.findByText('A note is required for this action.')).toBeInTheDocument();
    expect(mocks.requestChanges).not.toHaveBeenCalled();
  });

  it('round-trips inline metadata edits through the admin correction API', async () => {
    const user = userEvent.setup();
    const updated = detail({ title: 'An updated coastal home' });
    mocks.fetchDetail.mockResolvedValue(detail({ status: 'in_review', reviewedBy: 'admin-1' }));
    mocks.correct.mockResolvedValue(updated);
    renderQueue();

    await user.click(screen.getByRole('button', { name: /open review for a calm coastal home/i }));
    await user.click(await screen.findByRole('button', { name: /edit project title/i }));
    const titleInput = screen.getByRole('textbox', { name: 'Project title' });
    await user.clear(titleInput);
    await user.type(titleInput, 'An updated coastal home');
    await user.click(screen.getByRole('button', { name: /save project title/i }));

    await waitFor(() => {
      expect(mocks.correct).toHaveBeenCalledWith(projectId, { title: 'An updated coastal home' });
    });
    expect(await screen.findAllByText('An updated coastal home')).not.toHaveLength(0);
  });

  it('navigates beyond twenty projects and resets the page when changing tabs', async () => {
    const user = userEvent.setup();
    render(
      <AdminModerationQueue
        initialQueue={{ ...queue, total: 21, totalPages: 2 }}
        currentUserId="admin-1"
        currentUserRole="admin"
      />,
    );
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(mocks.push).toHaveBeenCalledWith('/moderation?status=submitted&page=2');
    await user.click(screen.getByRole('tab', { name: /Published/ }));
    expect(mocks.push).toHaveBeenCalledWith('/moderation?status=published&page=1');
  });

  it('clears a cancelled refresh when navigation starts', async () => {
    const user = userEvent.setup();
    mocks.fetchQueue.mockImplementation(() => new Promise(() => undefined));
    render(
      <AdminModerationQueue
        initialQueue={{ ...queue, total: 21, totalPages: 2 }}
        currentUserId="admin-1"
        currentUserRole="admin"
        initialError="The queue could not be loaded."
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Refresh queue' }));
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    await user.click(screen.getByRole('tab', { name: /Published/ }));

    expect(mocks.push).toHaveBeenCalledWith('/moderation?status=published&page=1');
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
  });

  it('keeps deep-linked tab and page, and corrects a page emptied by a decision', async () => {
    const user = userEvent.setup();
    mocks.fetchDetail.mockResolvedValue(detail({ status: 'in_review', reviewedBy: 'admin-1' }));
    mocks.publish.mockResolvedValue(detail({ status: 'published' }));
    mocks.fetchQueue.mockImplementation(async (tab: string, page: number) => ({
      ...queue,
      page,
      items: [],
      total: tab === 'in_review' ? 20 : 1,
      totalPages: 1,
    }));
    render(
      <AdminModerationQueue
        initialTab="in_review"
        initialQueue={{ ...queue, page: 2, total: 21, totalPages: 2 }}
        currentUserId="admin-1"
        currentUserRole="admin"
      />,
    );
    expect(screen.getByRole('tab', { name: /In review by me/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: /Open review/ }));
    await user.click(await screen.findByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(mocks.fetchQueue).toHaveBeenCalledWith('in_review', 2));
    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith('/moderation?status=in_review&page=1'),
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('validates comments, masks authors, resolves and reopens before approval', async () => {
    const user = userEvent.setup();
    mocks.fetchDetail.mockResolvedValue(detail({ status: 'in_review', reviewedBy: 'admin-1' }));
    renderQueue();
    await user.click(screen.getByRole('button', { name: /Open review/ }));
    await user.click(await screen.findByRole('button', { name: 'Add comment' }));
    expect(screen.getByRole('alert')).toHaveTextContent('between 1 and 2,000');
    expect(mocks.createComment).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Review comment'), {
      target: { value: 'a'.repeat(2001) },
    });
    await user.click(screen.getByRole('button', { name: 'Add comment' }));
    expect(mocks.createComment).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Review comment'), {
      target: { value: '  Please add a clear kitchen photo.  ' },
    });
    await user.click(screen.getByRole('button', { name: 'Add comment' }));
    await waitFor(() =>
      expect(mocks.createComment).toHaveBeenCalledWith(projectId, { body: comment.body }),
    );
    expect(await screen.findByText(comment.body)).toBeVisible();
    expect(screen.getByText(/Tickif Review Team ·/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Resolve comment' }));
    expect(await screen.findByRole('button', { name: 'Reopen comment' })).toBeEnabled();
    expect(mocks.updateComment).toHaveBeenCalledWith(projectId, comment.id, { status: 'resolved' });
    expect(screen.getByRole('button', { name: 'Approve' })).toBeEnabled();
    mocks.updateComment.mockResolvedValue(comment);
    await user.click(screen.getByRole('button', { name: 'Reopen comment' }));
    expect(await screen.findByRole('button', { name: 'Resolve comment' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled();
  });

  it('hides comment mutations from a non-owner but allows the superadmin override', async () => {
    const user = userEvent.setup();
    mocks.fetchDetail.mockResolvedValue({
      ...detail({ status: 'in_review', reviewedBy: 'admin-2' }),
      reviewComments: [comment],
    });
    const view = renderQueue();
    await user.click(screen.getByRole('button', { name: /Open review/ }));
    await screen.findByText(comment.body);
    expect(screen.queryByRole('button', { name: 'Add comment' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Resolve comment' })).not.toBeInTheDocument();
    view.unmount();
    render(
      <AdminModerationQueue
        initialQueue={queue}
        currentUserId="superadmin-1"
        currentUserRole="superadmin"
      />,
    );
    await user.click(screen.getByRole('button', { name: /Open review/ }));
    expect(await screen.findByRole('button', { name: 'Resolve comment' })).toBeEnabled();
  });

  it('preserves the draft after a stale claim error and prevents concurrent mutations', async () => {
    const user = userEvent.setup();
    let reject!: (error: Error) => void;
    mocks.createComment.mockImplementation(
      () =>
        new Promise((_resolve, rejectPromise) => {
          reject = rejectPromise;
        }),
    );
    renderQueue();
    await user.click(screen.getByRole('button', { name: /Open review/ }));
    fireEvent.change(await screen.findByLabelText('Review comment'), {
      target: { value: comment.body },
    });
    await user.click(screen.getByRole('button', { name: 'Add comment' }));
    expect(screen.getByRole('button', { name: 'Start review' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add comment' })).toBeDisabled();
    await act(async () => reject(new Error('Project is assigned to another reviewer')));
    expect(screen.getByRole('alert')).toHaveTextContent('assigned to another reviewer');
    expect(screen.getByLabelText('Review comment')).toHaveValue(comment.body);
    expect(mocks.createComment).toHaveBeenCalledTimes(1);
  });

  it('does not reopen a closed detail when a late response arrives', async () => {
    const user = userEvent.setup();
    let resolve!: (value: AdminModerationDetailResponse) => void;
    mocks.fetchDetail.mockImplementation(
      () =>
        new Promise((resolvePromise) => {
          resolve = resolvePromise;
        }),
    );
    renderQueue();
    await user.click(screen.getByRole('button', { name: /Open review/ }));
    await user.keyboard('{Escape}');
    await act(async () => resolve(detail()));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
