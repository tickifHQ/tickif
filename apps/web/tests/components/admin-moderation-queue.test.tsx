import { render, screen, waitFor } from '@testing-library/react';
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
}));

vi.mock('../../src/lib/admin-moderation-api', () => ({
  fetchAdminModerationQueue: mocks.fetchQueue,
  fetchAdminModerationDetail: mocks.fetchDetail,
  startAdminReview: mocks.startReview,
  publishAdminProject: mocks.publish,
  requestAdminChanges: mocks.requestChanges,
  rejectAdminProject: mocks.reject,
  unpublishAdminProject: mocks.unpublish,
  correctAdminProject: mocks.correct,
}));

const projectId = '11111111-1111-4111-8111-111111111111';
const designerId = '22222222-2222-4222-8222-222222222222';
const roomId = '33333333-3333-4333-8333-333333333333';
const imageId = '44444444-4444-4444-8444-444444444444';

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
  };
}

function renderQueue(currentUserId = 'admin-1') {
  return render(
    <AdminModerationQueue
      initialQueue={queue}
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
});
