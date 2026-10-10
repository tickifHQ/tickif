import { sql } from 'drizzle-orm';
import { bigint, check, pgTable, uuid } from 'drizzle-orm/pg-core';
import { project } from './domain.js';

/** Lifetime totals survive raw event retention; maintained by the event insert trigger. */
export const projectEngagement = pgTable(
  'project_engagement',
  {
    projectId: uuid('project_id')
      .primaryKey()
      .references(() => project.id, { onDelete: 'cascade' }),
    viewCount: bigint('view_count', { mode: 'number' }).default(0).notNull(),
  },
  (t) => [check('project_engagement_views_nonnegative', sql`${t.viewCount} >= 0`)],
);
