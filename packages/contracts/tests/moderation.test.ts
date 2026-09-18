import { describe, expect, it } from 'vitest';
import {
  adminCorrectProjectSchema,
  adminModerationQueueQuerySchema,
  DESIGNER_ATTRIBUTED_MODERATION_ACTIONS,
  moderationActorLabel,
  moderationHistoryResponseSchema,
  moderationAction,
  MODERATION_ACTOR_LABEL,
  SELF_SERVICE_MODERATION_ACTIONS,
  rejectProjectSchema,
} from '../src/moderation.js';

describe('moderation contracts', () => {
  it('requires a non-empty selection of closed moderation reason categories', () => {
    expect(
      rejectProjectSchema.safeParse({ note: 'Please replace the images.', reasonCode: 'anything' })
        .success,
    ).toBe(false);
    expect(
      rejectProjectSchema.safeParse({
        note: 'Please replace the images.',
        reasonCodes: ['image-quality', 'image-authenticity'],
      }).success,
    ).toBe(true);
    for (const reasonCodes of [[], ['anything'], ['image-quality', 'image-quality']]) {
      expect(
        rejectProjectSchema.safeParse({ note: 'Please replace the images.', reasonCodes }).success,
      ).toBe(false);
    }
  });
  it('accepts every persisted moderation action', () => {
    expect(moderationAction.options).toEqual([
      'submit',
      'resubmit',
      'withdraw',
      'start_review',
      'publish',
      'request_changes',
      'reject',
      'unpublish',
      'metadata_corrected',
      'archive',
      'restore',
      'delete',
      'organization_delist',
      'organization_archive',
      'organization_restore',
    ]);
  });

  it('classifies every action as either self-service or a reviewer verdict', () => {
    expect(SELF_SERVICE_MODERATION_ACTIONS).toEqual([
      'submit',
      'resubmit',
      'withdraw',
      'archive',
      'restore',
      'delete',
      'organization_delist',
      'organization_archive',
      'organization_restore',
    ]);
    // Retention keys off "not self-service", so an unclassified new action must default to
    // being treated as a reviewer verdict rather than silently becoming deletable.
    const reviewerActions = moderationAction.options.filter(
      (action) => !SELF_SERVICE_MODERATION_ACTIONS.includes(action),
    );
    expect(reviewerActions).toEqual([
      'start_review',
      'publish',
      'request_changes',
      'reject',
      'unpublish',
      'metadata_corrected',
    ]);
  });

  it('exposes a masked actor label without an actor identifier', () => {
    const result = moderationHistoryResponseSchema.parse({
      items: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          action: 'request_changes',
          fromStatus: 'in_review',
          toStatus: 'changes_requested',
          actorLabel: 'Tickif Review Team',
          note: 'Add a clearer cover image.',
          reasonCode: null,
          fieldDiff: null,
          createdAt: '2026-07-23T12:00:00.000Z',
        },
      ],
    });

    expect(result.items[0]).not.toHaveProperty('actorUserId');
    expect(result.items[0]?.actorLabel).toBe('Tickif Review Team');
  });

  it('rejects an unmasked actor label', () => {
    expect(() =>
      moderationHistoryResponseSchema.parse({
        items: [
          {
            id: '11111111-1111-4111-8111-111111111111',
            action: 'publish',
            fromStatus: 'in_review',
            toStatus: 'published',
            actorLabel: 'Admin Name',
            note: null,
            reasonCode: null,
            fieldDiff: null,
            createdAt: '2026-07-23T12:00:00.000Z',
          },
        ],
      }),
    ).toThrow();
  });

  // E-270: the actor label is bounded to two masked values — the designer's own
  // actions and the neutral review-team label. Neither is a real identity.
  it('accepts the designer actor label for a designer-attributed action', () => {
    const result = moderationHistoryResponseSchema.parse({
      items: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          action: 'withdraw',
          fromStatus: 'submitted',
          toStatus: 'draft',
          actorLabel: 'Designer',
          note: null,
          reasonCode: null,
          fieldDiff: null,
          createdAt: '2026-07-23T12:00:00.000Z',
        },
      ],
    });
    expect(result.items[0]?.actorLabel).toBe('Designer');
    expect(result.items[0]).not.toHaveProperty('actorUserId');
  });

  it('rejects any actor label outside the two masked values', () => {
    for (const actorLabel of ['You', 'Reviewer #4', 'admin', '']) {
      expect(() =>
        moderationHistoryResponseSchema.parse({
          items: [
            {
              id: '11111111-1111-4111-8111-111111111111',
              action: 'submit',
              fromStatus: 'draft',
              toStatus: 'submitted',
              actorLabel,
              note: null,
              reasonCode: null,
              fieldDiff: null,
              createdAt: '2026-07-23T12:00:00.000Z',
            },
          ],
        }),
      ).toThrow();
    }
  });

  it('derives the masked actor label from the action', () => {
    // Designer self-service submit/resubmit/withdraw read as the designer.
    expect(moderationActorLabel('submit')).toBe(MODERATION_ACTOR_LABEL.DESIGNER);
    expect(moderationActorLabel('resubmit')).toBe(MODERATION_ACTOR_LABEL.DESIGNER);
    expect(moderationActorLabel('withdraw')).toBe(MODERATION_ACTOR_LABEL.DESIGNER);

    // Reviewer verdicts stay masked as the team.
    for (const action of [
      'start_review',
      'request_changes',
      'reject',
      'publish',
      'unpublish',
      'metadata_corrected',
    ] as const) {
      expect(moderationActorLabel(action)).toBe(MODERATION_ACTOR_LABEL.REVIEW_TEAM);
    }

    // Actions that overlap the broader self-service set but are commonly admin-initiated
    // (archive/delete/organization retention) must NOT be attributed to the designer.
    for (const action of [
      'archive',
      'restore',
      'delete',
      'organization_delist',
      'organization_archive',
      'organization_restore',
    ] as const) {
      expect(moderationActorLabel(action)).toBe(MODERATION_ACTOR_LABEL.REVIEW_TEAM);
    }
  });

  it('keeps the designer-attributed actions a strict subset of self-service actions', () => {
    expect(DESIGNER_ATTRIBUTED_MODERATION_ACTIONS).toEqual(['submit', 'resubmit', 'withdraw']);
    for (const action of DESIGNER_ATTRIBUTED_MODERATION_ACTIONS) {
      expect(SELF_SERVICE_MODERATION_ACTIONS).toContain(action);
    }
  });

  it('defaults the admin queue to submitted projects in FIFO order', () => {
    expect(adminModerationQueueQuerySchema.parse({})).toEqual({
      status: 'submitted',
      sort: 'oldest',
      page: 1,
      limit: 20,
    });
  });

  it('accepts published as an admin moderation queue status', () => {
    expect(adminModerationQueueQuerySchema.parse({ status: 'published' })).toMatchObject({
      status: 'published',
      sort: 'oldest',
    });
  });

  it('accepts only allowlisted non-empty admin corrections', () => {
    expect(
      adminCorrectProjectSchema.parse({
        title: 'Corrected title',
        citySlug: 'mumbai',
        featuredAt: null,
      }),
    ).toEqual({
      title: 'Corrected title',
      citySlug: 'mumbai',
      featuredAt: null,
    });
    expect(() => adminCorrectProjectSchema.parse({})).toThrow();
    expect(() => adminCorrectProjectSchema.parse({ description: 'not allowlisted' })).toThrow();
  });
});
