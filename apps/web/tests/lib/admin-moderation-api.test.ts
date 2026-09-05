import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createAdminReviewComment,
  fetchAdminModerationQueue,
  updateAdminReviewComment,
} from '../../src/lib/admin-moderation-api';

const mock = vi.hoisted(() => ({ queue: vi.fn(), create: vi.fn(), update: vi.fn() }));
vi.mock('@/lib/api', () => ({
  api: {
    api: {
      admin: {
        projects: {
          $get: mock.queue,
          ':id': {
            'review-comments': { $post: mock.create, ':commentId': { $patch: mock.update } },
          },
        },
      },
    },
  },
}));

const projectId = '11111111-1111-4111-8111-111111111111';
const comment = {
  id: '22222222-2222-4222-8222-222222222222',
  projectId,
  authorLabel: 'Tickif Review Team',
  body: 'Add a photo',
  status: 'unresolved',
  createdAt: '2026-08-03T10:00:00.000Z',
  updatedAt: '2026-08-03T10:00:00.000Z',
};
const response = (payload: unknown) => ({ ok: true, json: async () => payload });

describe('admin moderation adapter', () => {
  beforeEach(() => vi.clearAllMocks());

  it('forwards the requested page and server session through the typed queue route', async () => {
    const queue = { items: [], page: 3, limit: 20, total: 41, totalPages: 3 };
    mock.queue.mockResolvedValue(response(queue));
    await expect(
      fetchAdminModerationQueue('in_review', 3, { headers: { cookie: 'session=valid' } }),
    ).resolves.toEqual(queue);
    expect(mock.queue).toHaveBeenCalledWith(
      { query: { status: 'in_review', sort: 'oldest', page: '3', limit: '20' } },
      { headers: { cookie: 'session=valid' } },
    );
  });

  it('creates and resolves masked comments through the project-scoped endpoints', async () => {
    mock.create.mockResolvedValue(response({ ...comment, authorId: 'private-admin' }));
    mock.update.mockResolvedValue(response({ ...comment, status: 'resolved' }));
    await expect(createAdminReviewComment(projectId, { body: 'Add a photo' })).resolves.toEqual(
      comment,
    );
    expect(mock.create).toHaveBeenCalledWith({
      param: { id: projectId },
      json: { body: 'Add a photo' },
    });
    await expect(
      updateAdminReviewComment(projectId, comment.id, { status: 'resolved' }),
    ).resolves.toMatchObject({ status: 'resolved' });
    expect(mock.update).toHaveBeenCalledWith({
      param: { id: projectId, commentId: comment.id },
      json: { status: 'resolved' },
    });
  });

  it('rejects malformed or unmasked responses and reports a failed mutation', async () => {
    mock.create.mockResolvedValue(response({ ...comment, authorLabel: 'Private Admin' }));
    await expect(createAdminReviewComment(projectId, { body: 'Add a photo' })).rejects.toThrow(
      'response was invalid',
    );
    mock.update.mockResolvedValue({ ok: false });
    await expect(
      updateAdminReviewComment(projectId, comment.id, { status: 'resolved' }),
    ).rejects.toThrow('Refresh the review');
    mock.queue.mockResolvedValue(response({ items: [] }));
    await expect(fetchAdminModerationQueue('submitted', 1)).rejects.toThrow('response was invalid');
  });
});
