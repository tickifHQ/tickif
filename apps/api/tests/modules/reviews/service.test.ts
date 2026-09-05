import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReviewViewRecord } from '../../../src/modules/reviews/repository.js';
import { reviewsService } from '../../../src/modules/reviews/service.js';

const repository = vi.hoisted(() => ({
  findById: vi.fn(),
  transition: vi.fn(),
  findAdminDetail: vi.fn(),
  listAdmin: vi.fn(),
}));
vi.mock('../../../src/modules/reviews/repository.js', () => ({ reviewsRepository: repository }));
const review: ReviewViewRecord = {
  id: '11111111-1111-4111-8111-111111111111',
  designerProfileId: '22222222-2222-4222-8222-222222222222',
  authorUserId: 'author',
  designerOrgId: 'org',
  authorName: 'Author',
  authorImage: null,
  projectId: null,
  projectTitle: null,
  projectSlug: null,
  bookingId: null,
  rating: 5,
  body: 'A thoughtful design and a clear process throughout.',
  status: 'pending',
  moderationRevision: 4,
  publishedAt: null,
  disputedAt: null,
  moderatedAt: null,
  createdAt: new Date('2026-09-01T10:00:00Z'),
  updatedAt: new Date('2026-09-01T10:00:00Z'),
};

describe('admin review decisions', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    repository.findById.mockResolvedValue(review);
  });
  it('rejects an admin decision on content edited after the detail was viewed', async () => {
    await expect(reviewsService.publish(review.id, { userId: 'admin' }, 3)).rejects.toMatchObject({
      status: 409,
    });
    expect(repository.transition).not.toHaveBeenCalled();
  });
  it('uses the viewed revision in the atomic persistence transition and reports concurrent conflicts', async () => {
    repository.transition.mockResolvedValue({ kind: 'conflict' });
    await expect(reviewsService.publish(review.id, { userId: 'admin' }, 4)).rejects.toMatchObject({
      status: 409,
    });
    expect(repository.transition).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedRevision: 4,
        fromStatus: 'pending',
        toStatus: 'published',
      }),
    );
  });
  it('rejects stale rejection and dispute decisions', async () => {
    await expect(
      reviewsService.reject(
        review.id,
        { note: 'Reason', reasonCode: 'spam' },
        { userId: 'admin' },
        3,
      ),
    ).rejects.toMatchObject({ status: 409 });
    repository.findById.mockResolvedValue({ ...review, status: 'disputed' });
    await expect(
      reviewsService.resolveDispute(
        review.id,
        { decision: 'remove', note: 'Reason' },
        { userId: 'admin' },
        3,
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(repository.transition).not.toHaveBeenCalled();
  });
  it('returns private history only from the admin detail model', async () => {
    repository.findAdminDetail.mockResolvedValue({
      review,
      designer: { id: review.designerProfileId, name: 'Studio' },
      history: [
        {
          id: 'event',
          actorUserId: 'admin',
          action: 'reject',
          fromStatus: 'pending',
          toStatus: 'rejected',
          note: 'Private evidence',
          reasonCode: 'spam',
          createdAt: review.createdAt,
        },
      ],
    });
    const detail = await reviewsService.getAdminDetail(review.id);
    expect(detail.history[0]).toMatchObject({
      note: 'Private evidence',
      createdAt: review.createdAt.toISOString(),
    });
    expect(detail.review).not.toHaveProperty('history');
    repository.listAdmin.mockResolvedValue({ items: [review], total: 41 });
    expect(await reviewsService.listAdmin({ status: 'pending', page: 3, limit: 20 })).toMatchObject(
      { page: 3, totalPages: 3, total: 41 },
    );
  });
});
