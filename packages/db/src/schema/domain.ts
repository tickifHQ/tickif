import {
  pgTable,
  uuid,
  text,
  integer,
  numeric,
  timestamp,
  boolean,
  pgEnum,
  jsonb,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { user, organization } from './auth.js';

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

// Entity type: individual freelancer vs registered company
export const entityTypeEnum = pgEnum('entity_type', ['individual', 'company']);

// Profile lifecycle
export const profileStatusEnum = pgEnum('profile_status', ['draft', 'active', 'suspended']);

export const designerProfile = pgTable(
  'designer_profile',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Owning organization (unique — 1 profile per org)
    orgId: text('org_id')
      .notNull()
      .unique()
      .references(() => organization.id, { onDelete: 'cascade' }),
    // Creator/audit trail (not the ownership key)
    userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
    entityType: entityTypeEnum('entity_type').notNull().default('individual'),
    displayName: text('display_name').notNull(),
    bio: text('bio'),
    logoImageId: text('logo_image_id'), // R2 media key (FK deferred to media epic)
    status: profileStatusEnum('status').notNull().default('draft'),
    // Proof/reputation counters (owned by their respective services)
    yearsExperience: integer('years_experience').default(0).notNull(),
    projectCount: integer('project_count').default(0).notNull(),
    shareCount: integer('share_count').default(0).notNull(),
    avgRating: numeric('avg_rating', { precision: 3, scale: 2 }).default('0').notNull(),
    reviewCount: integer('review_count').default(0).notNull(),
    // Corporate display fields (gated by entitlement at read time)
    websiteUrl: text('website_url'),
    testimonialBannerEnabled: boolean('testimonial_banner_enabled').default(false).notNull(),
    staffCount: integer('staff_count'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    index('designer_profile_org_idx').on(t.orgId),
    index('designer_profile_status_idx').on(t.status),
    uniqueIndex('designer_profile_user_id_unique')
      .on(t.userId)
      .where(sql`${t.userId} IS NOT NULL`),
  ],
);

// Footprint: links designer profile to taxonomy terms (city, scope, theme, etc.)
// Queryable/facetable — replaces array columns for filter/search.
export const designerProfileFootprint = pgTable(
  'designer_profile_footprint',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => designerProfile.id, { onDelete: 'cascade' }),
    taxonomyId: uuid('taxonomy_id')
      .notNull()
      .references(() => taxonomy.id, { onDelete: 'cascade' }),
  },
  (t) => [
    index('dpf_profile_idx').on(t.profileId),
    index('dpf_taxonomy_idx').on(t.taxonomyId),
    uniqueIndex('dpf_profile_taxonomy_uniq').on(t.profileId, t.taxonomyId),
  ],
);

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
    coverImageId: uuid('cover_image_id'),
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

export type ProjectRoomMetadata = {
  labels?: string[];
  attributeLabels?: Record<string, string[]>;
  [key: string]: unknown;
};

export const projectRoom = pgTable(
  'project_room',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => project.id, { onDelete: 'cascade' }),
    // Taxonomy terms are controlled vocabulary: deleting an in-use room type should be blocked.
    // E-102 validates that referenced terms have kind = 'room' at the service boundary.
    roomTypeId: uuid('room_type_id')
      .notNull()
      .references(() => taxonomy.id),
    name: text('name').notNull(),
    description: text('description'),
    sortOrder: integer('sort_order').default(0).notNull(),
    // Provisional labels until the taxonomy service exposes room attribute vocabularies (E-132).
    metadata: jsonb('metadata').$type<ProjectRoomMetadata>().default({}).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    index('project_room_project_idx').on(t.projectId),
    index('project_room_project_sort_idx').on(t.projectId, t.sortOrder, t.createdAt),
    index('project_room_type_idx').on(t.roomTypeId),
  ],
);

export const projectImageStatusEnum = pgEnum('project_image_status', [
  'processing',
  'ready',
  'failed',
]);

/** Derivative shape kept in jsonb so new sizes/formats stay config-driven (E-108) without schema churn. */
export type ProjectImageDerivative = {
  variant: string;
  format: string;
  key: string;
  width: number;
  height: number;
};

export const projectImage = pgTable(
  'project_image',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => project.id, { onDelete: 'cascade' }),
    roomId: uuid('room_id').references(() => projectRoom.id, { onDelete: 'set null' }),
    originalKey: text('original_key').notNull(),
    // Declared content-type pinned at mint (E-106); the worker re-validates bytes against it (E-107).
    contentType: text('content_type').notNull(),
    derivatives: jsonb('derivatives').$type<ProjectImageDerivative[]>().default([]).notNull(),
    width: integer('width'),
    height: integer('height'),
    phash: text('phash'),
    status: projectImageStatusEnum('status').default('processing').notNull(),
    sortOrder: integer('sort_order').default(0).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    index('project_image_project_idx').on(t.projectId),
    // Covers the list query's ORDER BY (project_id, sort_order, created_at) so it's an index scan.
    index('project_image_project_sort_idx').on(t.projectId, t.sortOrder, t.createdAt),
  ],
);
