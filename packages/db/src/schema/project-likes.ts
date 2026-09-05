import { index, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { user } from './auth.js';
import { project } from './domain.js';

/** Public appreciation is independent of a visitor's private saved-project list. */
export const projectLike = pgTable(
  'project_like',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => project.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.projectId] }),
    index('project_like_project_idx').on(t.projectId),
  ],
);
