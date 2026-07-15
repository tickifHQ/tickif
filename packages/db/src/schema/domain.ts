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
  check,
  type AnyPgColumn,
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
  'changes_requested',
]);

export const leadStatusEnum = pgEnum('lead_status', ['new', 'contacted', 'closed', 'spam']);

// Admin-managed taxonomy: 14 kinds covering geography, property, design, budget,
// and per-room attribute axes (E-124).
// v0 hierarchy: city → locality only. Deeper nesting not supported without CHECK revision.
export const taxonomyKindEnum = pgEnum('taxonomy_kind', [
  'city',
  'locality',
  'property_type',
  'property_subtype',
  'bhk',
  'room',
  'scope',
  'theme',
  'budget_band',
  // E-124: per-room attribute vocabularies
  'material',
  'finish',
  'layout',
  'palette',
  'size_band',
]);

export const taxonomy = pgTable(
  'taxonomy',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: taxonomyKindEnum('kind').notNull(),
    label: text('label').notNull(),
    slug: text('slug').notNull(),
    // Self-referencing FK for hierarchy. Only locality uses this (city → locality).
    // v0 policy: parentId is immutable after creation.
    parentId: uuid('parent_id').references((): AnyPgColumn => taxonomy.id, { onDelete: 'restrict' }),
    sortOrder: integer('sort_order').default(0).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    // Kind-specific data. budget_band stores { min: number, max: number }.
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    // Hierarchy: locality MUST have parent, all other kinds MUST NOT.
    check('taxonomy_hierarchy_check', sql`(${t.kind} = 'locality' AND ${t.parentId} IS NOT NULL) OR (${t.kind} <> 'locality' AND ${t.parentId} IS NULL)`),
    // Slug format: lowercase, URL-safe, immutable after creation.
    check('taxonomy_slug_format_check', sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
    // Non-locality kinds: slug unique within kind
    uniqueIndex('taxonomy_kind_slug_uniq')
      .on(t.kind, t.slug)
      .where(sql`${t.parentId} IS NULL`),
    // Locality: slug unique within parent city
    // Assumes locality URLs are city-scoped (e.g., /mumbai/andheri, /pune/andheri).
    // If product later requires globally unique locality URLs, this constraint must change.
    uniqueIndex('taxonomy_parent_slug_uniq')
      .on(t.parentId, t.slug)
      .where(sql`${t.parentId} IS NOT NULL`),
    // Public reads: filter active terms by kind
    index('taxonomy_kind_active_idx').on(t.kind, t.isActive),
    // Locality lookup by parent
    index('taxonomy_parent_idx').on(t.parentId),
    // Ordered listing
    index('taxonomy_kind_sort_idx').on(t.kind, t.sortOrder),
  ],
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
    googleBusinessUrl: text('google_business_url'),
    testimonialBannerEnabled: boolean('testimonial_banner_enabled')
      .default(false)
      .notNull(),
    staffCount: integer('staff_count'),
    // Contact & social presence
    phone: text('phone'),
    address: text('address'),
    instagramHandle: text('instagram_handle'),
    linkedinHandle: text('linkedin_handle'),
    youtubeHandle: text('youtube_handle'),
    // Company metadata
    firmType: text('firm_type'),
    foundedYear: integer('founded_year'),
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
      .references(() => taxonomy.id, { onDelete: 'restrict' }),
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
    // Project upload drafts store taxonomy slugs denormalized for ergonomic edits;
    // services validate slugs on write while profile footprint remains FK-backed for search.
    propertyTypeSlug: text('property_type_slug'),
    propertySubtypeSlug: text('property_subtype_slug'),
    scopeSlug: text('scope_slug'),
    bhkSlug: text('bhk_slug'),
    sizeSqft: integer('size_sqft'),
    citySlug: text('city_slug'),
    localitySlug: text('locality_slug'),
    buildingName: text('building_name'),
    budgetBandSlug: text('budget_band_slug'),
    // Points at project_image; FK deferred because project_image already owns project_id.
    coverImageId: uuid('cover_image_id'),
    completedMonth: text('completed_month'),
    durationMonths: integer('duration_months'),
    // flexible metadata (themes, scope tags, etc.) per the blueprint's JSONB approach
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    publishedAt: timestamp('published_at'),
    submittedAt: timestamp('submitted_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    index('project_status_idx').on(t.status),
    index('project_designer_idx').on(t.designerId),
    index('project_designer_status_updated_idx').on(t.designerId, t.status, t.updatedAt),
    index('project_city_idx').on(t.citySlug),
    index('project_locality_idx').on(t.localitySlug),
    index('project_property_type_idx').on(t.propertyTypeSlug),
    index('project_property_subtype_idx').on(t.propertySubtypeSlug),
    index('project_scope_idx').on(t.scopeSlug),
  ],
);

export const lead = pgTable(
  'lead',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    referredProjectId: uuid('referred_project_id').references(() => project.id, {
      onDelete: 'set null',
    }),
    name: text('name').notNull(),
    contactNumber: text('contact_number').notNull(),
    budgetBandSlug: text('budget_band_slug'),
    message: text('message'),
    source: text('source').default('enquiry').notNull(),
    status: leadStatusEnum('status').default('new').notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    index('lead_organization_idx').on(t.organizationId),
    index('lead_referred_project_idx').on(t.referredProjectId),
    index('lead_org_status_received_idx').on(t.organizationId, t.status, t.receivedAt),
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
    // Image-level taxonomy refs are draft-friendly slugs; media service validates each slug before write.
    themeSlugs: jsonb('theme_slugs').$type<string[]>().default([]).notNull(),
    materialSlugs: jsonb('material_slugs').$type<string[]>().default([]).notNull(),
    finishSlugs: jsonb('finish_slugs').$type<string[]>().default([]).notNull(),
    tagSlugs: jsonb('tag_slugs').$type<string[]>().default([]).notNull(),
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
    index('project_image_room_idx').on(t.roomId),
    // Covers the list query's ORDER BY (project_id, sort_order, created_at) so it's an index scan.
    index('project_image_project_sort_idx').on(t.projectId, t.sortOrder, t.createdAt),
  ],
);


// --- Designer Portfolio (E-222) ---

export const designerPortfolio = pgTable(
  'designer_portfolio',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    profileId: uuid('profile_id')
      .notNull()
      .unique()
      .references(() => designerProfile.id, { onDelete: 'cascade' }),

    // Link & URL
    publicLinkEnabled: boolean('public_link_enabled').default(true).notNull(),
    portfolioSlug: text('portfolio_slug').unique(),

    // Customizations
    accentColor: text('accent_color').default('#FF8F73').notNull(),

    // Section visibility
    showHero: boolean('show_hero').default(true).notNull(),
    showTrustCredentials: boolean('show_trust_credentials').default(true).notNull(),
    showFeaturedTestimonial: boolean('show_featured_testimonial').default(true).notNull(),
    showReviews: boolean('show_reviews').default(true).notNull(),
    showSocialLinks: boolean('show_social_links').default(true).notNull(),
    showShareBlock: boolean('show_share_block').default(true).notNull(),

    // Hero (tagline — displayName and bio live on designer_profile)
    tagline: text('tagline'),

    // Featured testimonial
    testimonialWords: text('testimonial_words'),
    testimonialAuthor: text('testimonial_author'),
    testimonialProjectId: uuid('testimonial_project_id').references(() => project.id, {
      onDelete: 'set null',
    }),
    testimonialUpdatedAt: timestamp('testimonial_updated_at'),

    // Review display settings (Google-agnostic names)
    showOverallRating: boolean('show_overall_rating').default(true).notNull(),
    showPositiveReviewsOnly: boolean('show_positive_reviews_only').default(false).notNull(),

    // Share block
    showTickifBadge: boolean('show_tickif_badge').default(true).notNull(),

    // Timestamps
    publishedAt: timestamp('published_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  // No explicit indexes needed — UNIQUE constraints create B-tree indexes
);
