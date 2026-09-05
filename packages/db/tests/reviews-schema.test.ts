import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import {
  review,
  reviewModerationActionEnum,
  reviewModerationEvent,
  reviewStatusEnum,
} from '../src/schema/domain.js';

describe('reviews schema', () => {
  it('keeps review and moderation states closed', () => {
    expect(reviewStatusEnum.enumValues).toEqual([
      'pending',
      'published',
      'rejected',
      'disputed',
      'removed',
    ]);
    expect(reviewModerationActionEnum.enumValues).toEqual([
      'submit',
      'edit',
      'publish',
      'reject',
      'dispute',
      'resolve_publish',
      'remove',
    ]);
  });

  it('enforces one review per author and designer and one review per booking', () => {
    const indexes = getTableConfig(review).indexes.map((tableIndex) => tableIndex.config);

    expect(indexes.find((index) => index.name === 'review_designer_author_uniq')).toMatchObject({
      unique: true,
    });
    expect(indexes.find((index) => index.name === 'review_booking_uniq')).toMatchObject({
      unique: true,
    });
  });

  it('indexes public, admin, and foreign-key lookup paths', () => {
    expect(getTableConfig(review).indexes.map((index) => index.config.name)).toEqual([
      'review_designer_author_uniq',
      'review_booking_uniq',
      'review_author_user_idx',
      'review_project_idx',
      'review_designer_published_idx',
      'review_designer_status_updated_idx',
      'review_status_updated_idx',
    ]);
  });

  it('retains audit history independently from actor accounts', () => {
    const config = getTableConfig(reviewModerationEvent);
    const actorForeignKey = config.foreignKeys.find((foreignKey) =>
      foreignKey.reference().columns.some((column) => column.name === 'actor_user_id'),
    );

    expect(actorForeignKey?.onDelete).toBe('set null');
  });

  it('constrains review lifecycle timestamps and audit transition pairs', () => {
    expect(getTableConfig(review).checks.map((tableCheck) => tableCheck.name)).toEqual(
      expect.arrayContaining(['review_timestamp_order_check', 'review_lifecycle_check']),
    );
    expect(
      getTableConfig(reviewModerationEvent).checks.map((tableCheck) => tableCheck.name),
    ).toContain('review_moderation_event_transition_check');
  });
});
