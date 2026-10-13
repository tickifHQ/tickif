import { index, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { user } from './auth.js';
import { designerProfile } from './domain.js';

export const designerFollow = pgTable(
  'designer_follow',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    designerProfileId: uuid('designer_profile_id')
      .notNull()
      .references(() => designerProfile.id, { onDelete: 'cascade' }),
    followedAt: timestamp('followed_at', { withTimezone: true }).defaultNow().notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.designerProfileId] }),
    index('designer_follow_profile_idx').on(t.designerProfileId),
    index('designer_follow_user_order_idx').on(t.userId, t.followedAt, t.designerProfileId),
  ],
);
