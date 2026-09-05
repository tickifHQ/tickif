import { describe, expect, it } from 'vitest';
import {
  adminReviewDecisionQuerySchema,
  adminReviewsQuerySchema,
  createReviewSchema,
  listPublishedReviewsQuerySchema,
  resolveReviewDisputeSchema,
  updateReviewSchema,
  reviewMutationQuerySchema,
} from '../src/reviews.js';

const PROFILE_ID = '11111111-1111-4111-8111-111111111111';

describe('review contracts', () => {
  it('requires exact integer revisions for participant edits and disputes', () => {
    for (const expectedRevision of ['', ' ', '1.5', '-1', true, '1e2', undefined]) {
      expect(reviewMutationQuerySchema.safeParse({ expectedRevision }).success).toBe(false);
    }
    expect(reviewMutationQuerySchema.parse({ expectedRevision: '2' })).toEqual({
      expectedRevision: 2,
    });
    expect(
      createReviewSchema.safeParse({
        designerProfileId: PROFILE_ID,
        rating: 5,
        authorUserId: 'another-user',
      }).success,
    ).toBe(false);
  });
  it('requires a nonnegative revision for admin decisions', () => {
    expect(adminReviewDecisionQuerySchema.safeParse({}).success).toBe(false);
    expect(adminReviewDecisionQuerySchema.safeParse({ expectedRevision: '' }).success).toBe(false);
    expect(adminReviewDecisionQuerySchema.safeParse({ expectedRevision: '  ' }).success).toBe(
      false,
    );
    expect(adminReviewDecisionQuerySchema.safeParse({ expectedRevision: '1e2' }).success).toBe(
      false,
    );
    expect(adminReviewDecisionQuerySchema.safeParse({ expectedRevision: '-1' }).success).toBe(
      false,
    );
    expect(adminReviewDecisionQuerySchema.safeParse({ expectedRevision: '1.5' }).success).toBe(
      false,
    );
    expect(adminReviewDecisionQuerySchema.parse({ expectedRevision: '0' })).toEqual({
      expectedRevision: 0,
    });
  });
  it('accepts a rating-only review and trims an optional body', () => {
    expect(
      createReviewSchema.parse({
        designerProfileId: PROFILE_ID,
        rating: 5,
      }),
    ).toEqual({
      designerProfileId: PROFILE_ID,
      rating: 5,
    });

    expect(
      createReviewSchema.parse({
        designerProfileId: PROFILE_ID,
        rating: 4,
        body: '  The consultation was thoughtful and very well structured.  ',
      }).body,
    ).toBe('The consultation was thoughtful and very well structured.');
  });

  it('rejects out-of-range ratings and non-empty bodies shorter than 30 characters', () => {
    expect(
      createReviewSchema.safeParse({
        designerProfileId: PROFILE_ID,
        rating: 0,
      }).success,
    ).toBe(false);
    expect(
      createReviewSchema.safeParse({
        designerProfileId: PROFILE_ID,
        rating: 5,
        body: 'Good work.',
      }).success,
    ).toBe(false);
    expect(
      createReviewSchema.safeParse({
        designerProfileId: PROFILE_ID,
        rating: 5,
        body: null,
      }).success,
    ).toBe(true);
  });

  it('requires at least one field when editing a review', () => {
    expect(updateReviewSchema.safeParse({}).success).toBe(false);
    expect(updateReviewSchema.safeParse({ rating: 3 }).success).toBe(true);
    expect(updateReviewSchema.safeParse({ body: null }).success).toBe(true);
  });

  it('uses explicit decisions when resolving disputes', () => {
    expect(
      resolveReviewDisputeSchema.parse({
        decision: 'remove',
        note: 'The review could not be substantiated.',
      }),
    ).toEqual({
      decision: 'remove',
      note: 'The review could not be substantiated.',
    });
    expect(
      resolveReviewDisputeSchema.safeParse({
        decision: 'reject',
        note: 'Invalid decision.',
      }).success,
    ).toBe(false);
  });

  it('coerces public and admin pagination while keeping status closed', () => {
    expect(
      listPublishedReviewsQuerySchema.parse({
        designerProfileId: PROFILE_ID,
        page: '2',
        limit: '10',
      }),
    ).toEqual({
      designerProfileId: PROFILE_ID,
      page: 2,
      limit: 10,
    });
    expect(adminReviewsQuerySchema.parse({})).toEqual({
      status: 'pending',
      page: 1,
      limit: 20,
    });
    expect(adminReviewsQuerySchema.safeParse({ status: 'draft' }).success).toBe(false);
  });
});
