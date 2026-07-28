import { describe, expect, it } from 'vitest';
import { moderationHistoryResponseSchema, moderationAction } from '../src/moderation.js';

describe('moderation contracts', () => {
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
});
