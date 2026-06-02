import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  boolean,
  pgEnum,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';
import { user } from './auth.js';

/**
 * Domain schema — first vertical slice.
 *
 * This intentionally covers only enough entities (taxonomy, designer profile,
 * project, project image) to prove the route -> service -> repository -> Drizzle
 * path end-to-end with realistic foreign keys. The remaining entities from the
 * blueprint (lead, review, booking, subscription, etc.) land in later phases.
 */

// Publishing state machine: Draft -> Submitted -> In Review -> Published / Rejected
export const projectStatusEnum = pgEnum('project_status', [
  'draft',
  'submitted',
  'in_review',
  'published',
  'rejected',
]);

// Admin-managed taxonomy: city, room, scope, theme, budget band
export const taxonomyKindEnum = pgEnum('taxonomy_kind', [
  'city',
  'room',
  'scope',
  'theme',
  'budget_band',
]);

export const taxonomy = pgTable(
  'taxonomy',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: taxonomyKindEnum('kind').notNull(),
    slug: text('slug').notNull(),
    label: text('label').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('taxonomy_kind_slug_idx').on(t.kind, t.slug)],
);

export const designerProfile = pgTable('designer_profile', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  studioName: text('studio_name').notNull(),
  bio: text('bio'),
  citySlug: text('city_slug'),
  isVerified: boolean('is_verified').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const project = pgTable(
  'project',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    designerId: uuid('designer_id')
      .notNull()
      .references(() => designerProfile.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    slug: text('slug').notNull().unique(),
    description: text('description'),
    status: projectStatusEnum('status').default('draft').notNull(),
    citySlug: text('city_slug'),
    budgetBandSlug: text('budget_band_slug'),
    // flexible metadata (themes, scope tags, etc.) per the blueprint's JSONB approach
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    publishedAt: timestamp('published_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    index('project_status_idx').on(t.status),
    index('project_designer_idx').on(t.designerId),
    index('project_city_idx').on(t.citySlug),
  ],
);

export const projectImage = pgTable('project_image', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => project.id, { onDelete: 'cascade' }),
  // R2 object key for the (private) original
  storageKey: text('storage_key').notNull(),
  // perceptual/content hash for dedup
  contentHash: text('content_hash'),
  roomSlug: text('room_slug'),
  width: integer('width'),
  height: integer('height'),
  position: integer('position').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
