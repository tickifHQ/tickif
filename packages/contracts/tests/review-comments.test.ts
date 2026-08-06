import { describe, expect, it } from 'vitest';
import {
  createProjectReviewCommentSchema,
  projectReviewCommentParamsSchema,
  projectReviewCommentSchema,
  updateProjectReviewCommentSchema,
} from '../src/review-comments.js';

describe('project review comment contracts', () => {
  it('trims a bounded reviewer comment body', () => {
    expect(createProjectReviewCommentSchema.parse({ body: '  Add clearer room labels.  ' })).toEqual({
      body: 'Add clearer room labels.',
    });
    expect(createProjectReviewCommentSchema.safeParse({ body: '   ' }).success).toBe(false);
    expect(createProjectReviewCommentSchema.safeParse({ body: 'x'.repeat(2001) }).success).toBe(
      false,
    );
  });

  it('exposes a masked reviewer identity and independent status', () => {
    expect(
      projectReviewCommentSchema.parse({
        id: '11111111-1111-4111-8111-111111111111',
        projectId: '22222222-2222-4222-8222-222222222222',
        authorLabel: 'Tickif Review Team',
        body: 'Add a wider kitchen photo.',
        status: 'unresolved',
        createdAt: '2026-08-04T08:00:00.000Z',
        updatedAt: '2026-08-04T08:00:00.000Z',
      }),
    ).toMatchObject({
      authorLabel: 'Tickif Review Team',
      status: 'unresolved',
    });
  });

  it('accepts only explicit resolution states and strict UUID params', () => {
    expect(updateProjectReviewCommentSchema.parse({ status: 'resolved' })).toEqual({
      status: 'resolved',
    });
    expect(updateProjectReviewCommentSchema.safeParse({ status: 'closed' }).success).toBe(false);
    expect(
      projectReviewCommentParamsSchema.safeParse({
        id: '11111111-1111-4111-8111-111111111111',
        commentId: '22222222-2222-4222-8222-222222222222',
      }).success,
    ).toBe(true);
  });
});
