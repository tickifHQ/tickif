import {
  pgTable,
  bigint,
  uuid,
  text,
  integer,
  smallint,
  numeric,
  timestamp,
  date,
  boolean,
  pgEnum,
  jsonb,
  index,
  primaryKey,
  uniqueIndex,
  check,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import {
  INTERACTION_EVENT_TYPE_VALUES,
  PLAN_TIER_VALUES,
  SUBSCRIPTION_STATE_VALUES,
  TAXONOMY_KIND_VALUES,
  VERIFICATION_APPLICATION_STATUS,
  VERIFICATION_APPLICATION_STATUS_VALUES,
  VERIFICATION_DOCUMENT_STATUS,
  VERIFICATION_DOCUMENT_STATUS_VALUES,
  VERIFICATION_DOCUMENT_TYPE_VALUES,
  VERIFICATION_NOTIFICATION_EVENT_VALUES,
  VERIFICATION_REVIEW_ACTION_VALUES,
  OWNERSHIP_TRANSFER_STATUS_VALUES,
} from '@repo/contracts';
import { user, organization, team } from './auth.js';

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
  'archived',
  'delisted',
  'deleted',
]);

export const projectArchiveReasonEnum = pgEnum('project_archive_reason', [
  'manual',
  'organization_retention',
]);

export const interactionEventTypeEnum = pgEnum(
  'interaction_event_type',
  INTERACTION_EVENT_TYPE_VALUES,
);

export const ownershipTransferStatusEnum = pgEnum(
  'ownership_transfer_status',
  OWNERSHIP_TRANSFER_STATUS_VALUES,
);

export const ownershipTransferRequest = pgTable(
  'ownership_transfer_request',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    initiatorUserId: text('initiator_user_id').references(() => user.id, { onDelete: 'set null' }),
    targetUserId: text('target_user_id').references(() => user.id, { onDelete: 'set null' }),
    targetMemberId: text('target_member_id').notNull(),
    status: ownershipTransferStatusEnum('status').default('pending').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    uniqueIndex('ownership_transfer_pending_organization_uniq')
      .on(t.organizationId)
      .where(sql`${t.status} = 'pending'`),
    index('ownership_transfer_target_status_idx').on(t.targetUserId, t.status),
    index('ownership_transfer_expiry_idx')
      .on(t.expiresAt)
      .where(sql`${t.status} = 'pending'`),
    check(
      'ownership_transfer_distinct_parties_check',
      sql`${t.initiatorUserId} <> ${t.targetUserId}`,
    ),
    check(
      'ownership_transfer_resolution_check',
      sql`(${t.status} = 'pending' and ${t.resolvedAt} is null) or (${t.status} <> 'pending' and ${t.resolvedAt} is not null)`,
    ),
  ],
);

export const ownershipTransferAuditEvent = pgTable(
  'ownership_transfer_audit_event',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    transferId: uuid('transfer_id')
      .notNull()
      .references(() => ownershipTransferRequest.id, { onDelete: 'cascade' }),
    status: ownershipTransferStatusEnum('status').notNull(),
    actorUserId: text('actor_user_id').references(() => user.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('ownership_transfer_audit_status_uniq').on(t.transferId, t.status),
    index('ownership_transfer_audit_transfer_idx').on(t.transferId, t.createdAt),
  ],
);

export const moderationActionEnum = pgEnum('moderation_action', [
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
]);

export const projectReviewCommentStatusEnum = pgEnum('project_review_comment_status', [
  'unresolved',
  'resolved',
]);

export const leadStatusEnum = pgEnum('lead_status', ['new', 'contacted', 'closed', 'spam']);

export const enquiryStatusEnum = pgEnum('enquiry_status', ['open', 'responded', 'closed']);

export const bookingStatusEnum = pgEnum('booking_status', [
  'requested',
  'confirmed',
  'completed',
  'cancelled',
]);

export const bookingCancelledByEnum = pgEnum('booking_cancelled_by', ['requester', 'designer']);

export const reviewStatusEnum = pgEnum('review_status', [
  'pending',
  'published',
  'rejected',
  'disputed',
  'removed',
]);

export const reviewModerationActionEnum = pgEnum('review_moderation_action', [
  'submit',
  'edit',
  'publish',
  'reject',
  'dispute',
  'resolve_publish',
  'remove',
]);

export const verificationApplicationStatusEnum = pgEnum(
  'verification_application_status',
  VERIFICATION_APPLICATION_STATUS_VALUES,
);

export const verificationDocumentTypeEnum = pgEnum(
  'verification_document_type',
  VERIFICATION_DOCUMENT_TYPE_VALUES,
);

export const verificationDocumentStatusEnum = pgEnum(
  'verification_document_status',
  VERIFICATION_DOCUMENT_STATUS_VALUES,
);

export const verificationReviewActionEnum = pgEnum(
  'verification_review_action',
  VERIFICATION_REVIEW_ACTION_VALUES,
);

export const verificationNotificationEventEnum = pgEnum(
  'verification_notification_event',
  VERIFICATION_NOTIFICATION_EVENT_VALUES,
);

// Admin-managed taxonomy: 14 kinds covering geography, property, design, budget,
// and per-room attribute axes (E-124).
// v0 hierarchy: city → locality only. Deeper nesting not supported without CHECK revision.
export const taxonomyKindEnum = pgEnum('taxonomy_kind', TAXONOMY_KIND_VALUES);

export const taxonomy = pgTable(
  'taxonomy',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: taxonomyKindEnum('kind').notNull(),
    label: text('label').notNull(),
    slug: text('slug').notNull(),
    // Self-referencing FK for hierarchy. Only locality uses this (city → locality).
    // v0 policy: parentId is immutable after creation.
    parentId: uuid('parent_id').references((): AnyPgColumn => taxonomy.id, {
      onDelete: 'restrict',
    }),
    sortOrder: integer('sort_order').default(0).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    // Kind-specific data. budget_band stores { min: number, max: number }.
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    // Hierarchy: locality MUST have parent, all other kinds MUST NOT.
    check(
      'taxonomy_hierarchy_check',
      sql`(${t.kind} = 'locality' AND ${t.parentId} IS NOT NULL) OR (${t.kind} <> 'locality' AND ${t.parentId} IS NULL)`,
    ),
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

/** Demand-side profile data that is not owned by Better Auth. */
export const visitorProfile = pgTable(
  'visitor_profile',
  {
    userId: text('user_id')
      .primaryKey()
      .references(() => user.id, { onDelete: 'cascade' }),
    address: text('address'),
    whatsappNumber: text('whatsapp_number'),
    onboardingCompletedAt: timestamp('onboarding_completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    check(
      'visitor_profile_address_length_check',
      sql`${t.address} IS NULL OR char_length(trim(${t.address})) BETWEEN 1 AND 300`,
    ),
    check(
      'visitor_profile_whatsapp_e164_check',
      sql`${t.whatsappNumber} IS NULL OR ${t.whatsappNumber} ~ '^[+][1-9][0-9]{7,14}$'`,
    ),
  ],
);

export const designerProfile = pgTable(
  'designer_profile',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Billing/verification owner. Multiple branch profiles may share an organization.
    orgId: text('org_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    // Operational branch boundary. Exactly one public profile belongs to each team.
    teamId: text('team_id')
      .notNull()
      .unique()
      .references(() => team.id, { onDelete: 'cascade' }),
    // Creator/audit trail (not the ownership key)
    userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
    entityType: entityTypeEnum('entity_type').notNull().default('individual'),
    displayName: text('display_name').notNull(),
    slug: text('slug').notNull().unique(),
    bio: text('bio'),
    logoImageId: text('logo_image_id'), // R2 media key (FK deferred to media epic)
    status: profileStatusEnum('status').notNull().default('draft'),
    // Proof/reputation counters (owned by their respective services)
    yearsExperience: integer('years_experience').default(0).notNull(),
    projectCount: integer('project_count').default(0).notNull(),
    shareCount: integer('share_count').default(0).notNull(),
    avgRating: numeric('avg_rating', { precision: 3, scale: 2 }).default('0').notNull(),
    reviewCount: integer('review_count').default(0).notNull(),
    websiteUrl: text('website_url'),
    googleBusinessUrl: text('google_business_url'),
    testimonialBannerEnabled: boolean('testimonial_banner_enabled').default(false).notNull(),
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
    index('designer_profile_team_idx').on(t.teamId),
    index('designer_profile_status_idx').on(t.status),
    index('designer_profile_user_idx').on(t.userId),
    // Paired with `project_title_trgm_idx` — the discovery feed's degraded text search
    // ORs the designer's display name into the same `ILIKE '%q%'` predicate.
    index('designer_profile_display_name_trgm_idx').using('gin', t.displayName.op('gin_trgm_ops')),
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
    archiveReason: projectArchiveReasonEnum('archive_reason'),
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
    reviewedBy: text('reviewed_by').references(() => user.id, { onDelete: 'set null' }),
    reviewStartedAt: timestamp('review_started_at'),
    rejectionReasonCode: text('rejection_reason_code'),
    moderationNote: text('moderation_note'),
    featuredAt: timestamp('featured_at'),
    moderationRevision: integer('moderation_revision').default(0).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    index('project_status_idx').on(t.status),
    index('project_designer_idx').on(t.designerId),
    index('project_designer_status_updated_idx').on(t.designerId, t.status, t.updatedAt),
    index('project_city_idx').on(t.citySlug),
    index('project_published_budget_recommendation_idx')
      .on(
        t.budgetBandSlug,
        sql`${t.publishedAt} desc nulls last`,
        sql`${t.createdAt} desc`,
        sql`${t.id} desc`,
      )
      .where(sql`${t.status} = 'published'`),
    index('project_published_designer_recommendation_idx')
      .on(
        t.designerId,
        sql`${t.publishedAt} desc nulls last`,
        sql`${t.createdAt} desc`,
        sql`${t.id} desc`,
      )
      .where(sql`${t.status} = 'published'`),
    index('project_published_city_recommendation_idx')
      .on(
        t.citySlug,
        sql`${t.publishedAt} desc nulls last`,
        sql`${t.createdAt} desc`,
        sql`${t.id} desc`,
      )
      .where(sql`${t.status} = 'published'`),
    index('project_locality_idx').on(t.localitySlug),
    index('project_property_type_idx').on(t.propertyTypeSlug),
    index('project_property_subtype_idx').on(t.propertySubtypeSlug),
    index('project_scope_idx').on(t.scopeSlug),
    index('project_bhk_idx').on(t.bhkSlug),
    index('project_budget_band_idx').on(t.budgetBandSlug),
    index('project_reviewed_by_idx').on(t.reviewedBy),
    index('project_featured_at_idx').on(t.featuredAt),
    index('project_submitted_moderation_queue_idx')
      .on(t.submittedAt, t.id)
      .where(sql`${t.status} = 'submitted'`),
    index('project_in_review_moderation_queue_idx')
      .on(t.reviewedBy, t.submittedAt, t.id)
      .where(sql`${t.status} = 'in_review'`),
    // Trigram indexes for the discovery feed's degraded (Postgres) text search, which
    // matches `ILIKE '%q%'`. A leading wildcard cannot use a btree index, so without
    // these the public `?q=` path sequentially scans `project` on every uncached
    // request — and `q` is caller-controlled, so it defeats the response cache.
    // Requires the `pg_trgm` extension (created in migration 0036).
    index('project_title_trgm_idx').using('gin', t.title.op('gin_trgm_ops')),
    index('project_description_trgm_idx').using('gin', t.description.op('gin_trgm_ops')),
  ],
);

/**
 * Append-only page-view events for Phase 3 analytics.
 *
 * `eventKey` is generated by the client and makes transport retries idempotent.
 * `anonymousId` is an opaque pseudonymous client identifier and is personal data;
 * it must never contain a session token or fingerprint. Events are retained for at
 * most 400 days so the longest 90-day report remains reproducible with operational
 * headroom, then purged by the platform retention process.
 */
export const interactionEvent = pgTable(
  'interaction_event',
  {
    id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
    eventKey: uuid('event_key').notNull(),
    type: interactionEventTypeEnum('type').notNull(),
    anonymousId: uuid('anonymous_id').notNull(),
    actorUserId: text('actor_user_id').references(() => user.id, { onDelete: 'set null' }),
    projectId: uuid('project_id').references(() => project.id, { onDelete: 'cascade' }),
    designerProfileId: uuid('designer_profile_id').references(() => designerProfile.id, {
      onDelete: 'cascade',
    }),
    eventDay: date('event_day')
      .default(sql`(now() at time zone 'utc')::date`)
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    check(
      'interaction_event_target_check',
      sql`
        (${t.type} = 'project_view' AND ${t.projectId} IS NOT NULL AND ${t.designerProfileId} IS NULL)
        OR
        (${t.type} = 'profile_view' AND ${t.projectId} IS NULL AND ${t.designerProfileId} IS NOT NULL)
      `,
    ),
    check(
      'interaction_event_day_check',
      sql`${t.eventDay} = (${t.createdAt} at time zone 'utc')::date`,
    ),
    uniqueIndex('interaction_event_event_key_uniq').on(t.eventKey),
    uniqueIndex('interaction_event_actor_project_day_uniq')
      .on(t.actorUserId, t.projectId, t.eventDay)
      .where(sql`${t.type} = 'project_view' AND ${t.actorUserId} IS NOT NULL`),
    uniqueIndex('interaction_event_actor_profile_day_uniq')
      .on(t.actorUserId, t.designerProfileId, t.eventDay)
      .where(sql`${t.type} = 'profile_view' AND ${t.actorUserId} IS NOT NULL`),
    index('interaction_event_project_created_idx').on(t.projectId, t.createdAt),
    index('interaction_event_profile_created_idx').on(t.designerProfileId, t.createdAt),
    index('interaction_event_created_idx').on(t.createdAt),
  ],
);

export const savedProject = pgTable(
  'saved_project',
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
    index('saved_project_project_idx').on(t.projectId),
  ],
);

export type ModerationFieldDiff = Record<string, { from: unknown; to: unknown }>;

export const projectModerationEvent = pgTable(
  'project_moderation_event',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => project.id, { onDelete: 'restrict' }),
    // Nulled rather than restricted on user deletion: the audit row must outlive the
    // actor (account closure, GDPR erasure), and `actorLabel` is masked on read anyway.
    actorUserId: text('actor_user_id').references(() => user.id, { onDelete: 'set null' }),
    action: moderationActionEnum('action').notNull(),
    fromStatus: projectStatusEnum('from_status').notNull(),
    toStatus: projectStatusEnum('to_status').notNull(),
    note: text('note'),
    reasonCode: text('reason_code'),
    fieldDiff: jsonb('field_diff').$type<ModerationFieldDiff>(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    index('project_moderation_event_project_created_idx').on(t.projectId, t.createdAt),
    index('project_moderation_event_actor_idx').on(t.actorUserId),
  ],
);

export const projectReviewComment = pgTable(
  'project_review_comment',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => project.id, { onDelete: 'restrict' }),
    authorId: text('author_id').references(() => user.id, { onDelete: 'set null' }),
    body: text('body').notNull(),
    status: projectReviewCommentStatusEnum('status').default('unresolved').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    index('project_review_comment_project_idx').on(t.projectId),
    index('project_review_comment_project_unresolved_idx')
      .on(t.projectId, t.status)
      .where(sql`${t.status} = 'unresolved'`),
  ],
);

export const lead = pgTable(
  'lead',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    teamId: text('team_id')
      .notNull()
      .references(() => team.id, { onDelete: 'cascade' }),
    referredProjectId: uuid('referred_project_id').references(() => project.id, {
      onDelete: 'set null',
    }),
    name: text('name').notNull(),
    contactNumber: text('contact_number').notNull(),
    budgetBandSlug: text('budget_band_slug'),
    message: text('message'),
    notes: text('notes'),
    source: text('source').default('enquiry').notNull(),
    status: leadStatusEnum('status').default('new').notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    index('lead_organization_idx').on(t.organizationId),
    index('lead_team_idx').on(t.teamId),
    index('lead_referred_project_idx').on(t.referredProjectId),
    index('lead_org_status_received_idx').on(t.organizationId, t.status, t.receivedAt),
    index('lead_team_status_received_idx').on(t.teamId, t.status, t.receivedAt),
  ],
);

export const enquiry = pgTable(
  'enquiry',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    requesterId: text('requester_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    designerProfileId: uuid('designer_profile_id')
      .notNull()
      .references(() => designerProfile.id, { onDelete: 'cascade' }),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    referredProjectId: uuid('referred_project_id').references(() => project.id, {
      onDelete: 'set null',
    }),
    subject: text('subject').notNull(),
    description: text('description').notNull(),
    templateUsed: text('template_used'),
    budget: text('budget').notNull(),
    timeline: text('timeline'),
    status: enquiryStatusEnum('status').default('open').notNull(),
    leadId: uuid('lead_id').references(() => lead.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    index('enquiry_requester_idx').on(t.requesterId),
    index('enquiry_designer_profile_idx').on(t.designerProfileId),
    index('enquiry_organization_idx').on(t.organizationId),
    index('enquiry_requester_designer_status_idx').on(t.requesterId, t.designerProfileId, t.status),
  ],
);

export type ConsultationSlot = {
  date: string;
  window: 'morning' | 'afternoon' | 'evening';
};

export const consultationBooking = pgTable(
  'consultation_booking',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    designerProfileId: uuid('designer_profile_id')
      .notNull()
      .references(() => designerProfile.id, { onDelete: 'cascade' }),
    requesterId: text('requester_id')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    referredProjectId: uuid('referred_project_id').references(() => project.id, {
      onDelete: 'set null',
    }),
    preferredSlots: jsonb('preferred_slots').$type<ConsultationSlot[]>().notNull(),
    confirmedSlot: jsonb('confirmed_slot').$type<ConsultationSlot>(),
    message: text('message'),
    status: bookingStatusEnum('status').default('requested').notNull(),
    cancelledBy: bookingCancelledByEnum('cancelled_by'),
    cancelledByUserId: text('cancelled_by_user_id').references(() => user.id, {
      onDelete: 'restrict',
    }),
    cancelReason: text('cancel_reason'),
    requestedAt: timestamp('requested_at', { withTimezone: true }).defaultNow().notNull(),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    check(
      'consultation_booking_preferred_slots_count_check',
      sql`jsonb_typeof(${t.preferredSlots}) = 'array' AND jsonb_array_length(${t.preferredSlots}) BETWEEN 1 AND 3`,
    ),
    check(
      'consultation_booking_confirmed_slot_check',
      sql`${t.confirmedSlot} IS NULL OR ${t.preferredSlots} @> jsonb_build_array(${t.confirmedSlot})`,
    ),
    check(
      'consultation_booking_lifecycle_check',
      sql`
        (
          ${t.status} = 'requested'
          AND ${t.confirmedSlot} IS NULL
          AND ${t.confirmedAt} IS NULL
          AND ${t.completedAt} IS NULL
          AND ${t.cancelledAt} IS NULL
          AND ${t.cancelledBy} IS NULL
          AND ${t.cancelledByUserId} IS NULL
          AND ${t.cancelReason} IS NULL
        )
        OR (
          ${t.status} = 'confirmed'
          AND ${t.confirmedSlot} IS NOT NULL
          AND ${t.confirmedAt} IS NOT NULL
          AND ${t.completedAt} IS NULL
          AND ${t.cancelledAt} IS NULL
          AND ${t.cancelledBy} IS NULL
          AND ${t.cancelledByUserId} IS NULL
          AND ${t.cancelReason} IS NULL
        )
        OR (
          ${t.status} = 'completed'
          AND ${t.confirmedSlot} IS NOT NULL
          AND ${t.confirmedAt} IS NOT NULL
          AND ${t.completedAt} IS NOT NULL
          AND ${t.cancelledAt} IS NULL
          AND ${t.cancelledBy} IS NULL
          AND ${t.cancelledByUserId} IS NULL
          AND ${t.cancelReason} IS NULL
        )
        OR (
          ${t.status} = 'cancelled'
          AND ${t.completedAt} IS NULL
          AND ${t.cancelledAt} IS NOT NULL
          AND ${t.cancelledBy} IS NOT NULL
          AND ${t.cancelledByUserId} IS NOT NULL
          AND (
            (${t.confirmedSlot} IS NULL AND ${t.confirmedAt} IS NULL)
            OR (${t.confirmedSlot} IS NOT NULL AND ${t.confirmedAt} IS NOT NULL)
          )
        )
      `,
    ),
    check(
      'consultation_booking_designer_cancel_reason_check',
      sql`${t.cancelledBy} IS DISTINCT FROM 'designer' OR nullif(btrim(${t.cancelReason}), '') IS NOT NULL`,
    ),
    check(
      'consultation_booking_timestamp_order_check',
      sql`
        (${t.confirmedAt} IS NULL OR ${t.confirmedAt} >= ${t.requestedAt})
        AND (${t.completedAt} IS NULL OR ${t.completedAt} >= ${t.confirmedAt})
        AND (${t.cancelledAt} IS NULL OR ${t.cancelledAt} >= ${t.requestedAt})
        AND (${t.cancelledAt} IS NULL OR ${t.confirmedAt} IS NULL OR ${t.cancelledAt} >= ${t.confirmedAt})
      `,
    ),
    index('consultation_booking_organization_idx').on(t.organizationId),
    index('consultation_booking_designer_profile_idx').on(t.designerProfileId),
    index('consultation_booking_requester_idx').on(t.requesterId),
    index('consultation_booking_referred_project_idx').on(t.referredProjectId),
    index('consultation_booking_requester_designer_status_idx').on(
      t.requesterId,
      t.designerProfileId,
      t.status,
    ),
    index('consultation_booking_org_status_requested_idx').on(
      t.organizationId,
      t.status,
      t.requestedAt,
    ),
  ],
);

export const review = pgTable(
  'review',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    designerProfileId: uuid('designer_profile_id')
      .notNull()
      .references(() => designerProfile.id, { onDelete: 'restrict' }),
    authorUserId: text('author_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    projectId: uuid('project_id').references(() => project.id, { onDelete: 'set null' }),
    bookingId: uuid('booking_id').references(() => consultationBooking.id, {
      onDelete: 'restrict',
    }),
    rating: smallint('rating').notNull(),
    body: text('body'),
    status: reviewStatusEnum('status').default('pending').notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    disputedAt: timestamp('disputed_at', { withTimezone: true }),
    moderatedAt: timestamp('moderated_at', { withTimezone: true }),
    moderationRevision: integer('moderation_revision').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    check('review_rating_check', sql`${t.rating} between 1 and 5`),
    check('review_moderation_revision_check', sql`${t.moderationRevision} >= 0`),
    check(
      'review_body_length_check',
      sql`${t.body} is null or char_length(btrim(${t.body})) >= 30`,
    ),
    check(
      'review_timestamp_order_check',
      sql`
        ${t.updatedAt} >= ${t.createdAt}
        and (${t.publishedAt} is null or ${t.publishedAt} >= ${t.createdAt})
        and (${t.disputedAt} is null or ${t.disputedAt} >= ${t.createdAt})
        and (${t.moderatedAt} is null or ${t.moderatedAt} >= ${t.createdAt})
      `,
    ),
    check(
      'review_lifecycle_check',
      sql`
        (
          ${t.status} = 'pending'
          and ${t.publishedAt} is null
          and ${t.disputedAt} is null
          and ${t.moderatedAt} is null
        )
        or (
          ${t.status} = 'rejected'
          and ${t.publishedAt} is null
          and ${t.disputedAt} is null
          and ${t.moderatedAt} is not null
        )
        or (
          ${t.status} = 'published'
          and ${t.publishedAt} is not null
          and ${t.disputedAt} is null
          and ${t.moderatedAt} is not null
          and ${t.moderatedAt} >= ${t.publishedAt}
        )
        or (
          ${t.status} = 'disputed'
          and ${t.publishedAt} is not null
          and ${t.disputedAt} is not null
          and ${t.moderatedAt} is not null
          and ${t.disputedAt} >= ${t.publishedAt}
          and ${t.moderatedAt} >= ${t.publishedAt}
          and ${t.moderatedAt} <= ${t.disputedAt}
        )
        or (
          ${t.status} = 'removed'
          and ${t.publishedAt} is not null
          and ${t.disputedAt} is not null
          and ${t.moderatedAt} is not null
          and ${t.disputedAt} >= ${t.publishedAt}
          and ${t.moderatedAt} >= ${t.disputedAt}
        )
      `,
    ),
    uniqueIndex('review_designer_author_uniq').on(t.designerProfileId, t.authorUserId),
    uniqueIndex('review_booking_uniq')
      .on(t.bookingId)
      .where(sql`${t.bookingId} is not null`),
    index('review_author_user_idx').on(t.authorUserId),
    index('review_project_idx').on(t.projectId),
    index('review_designer_published_idx')
      .on(t.designerProfileId, t.publishedAt, t.id)
      .where(sql`${t.status} = 'published'`),
    index('review_status_updated_idx').on(t.status, t.updatedAt, t.id),
  ],
);

export const reviewModerationEvent = pgTable(
  'review_moderation_event',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reviewId: uuid('review_id')
      .notNull()
      .references(() => review.id, { onDelete: 'restrict' }),
    actorUserId: text('actor_user_id').references(() => user.id, { onDelete: 'set null' }),
    action: reviewModerationActionEnum('action').notNull(),
    fromStatus: reviewStatusEnum('from_status'),
    toStatus: reviewStatusEnum('to_status').notNull(),
    note: text('note'),
    reasonCode: text('reason_code'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    check(
      'review_moderation_event_transition_check',
      sql`
        (${t.action} = 'submit' and ${t.fromStatus} is null and ${t.toStatus} = 'pending')
        or (
          ${t.fromStatus} is not null
          and (
            (
              ${t.action} = 'edit'
              and ${t.fromStatus} in ('pending', 'published')
              and ${t.toStatus} = 'pending'
            )
            or (
              ${t.action} = 'publish'
              and ${t.fromStatus} = 'pending'
              and ${t.toStatus} = 'published'
            )
            or (
              ${t.action} = 'reject'
              and ${t.fromStatus} = 'pending'
              and ${t.toStatus} = 'rejected'
            )
            or (
              ${t.action} = 'dispute'
              and ${t.fromStatus} = 'published'
              and ${t.toStatus} = 'disputed'
            )
            or (
              ${t.action} = 'resolve_publish'
              and ${t.fromStatus} = 'disputed'
              and ${t.toStatus} = 'published'
            )
            or (
              ${t.action} = 'remove'
              and ${t.fromStatus} = 'disputed'
              and ${t.toStatus} = 'removed'
            )
          )
        )
      `,
    ),
    index('review_moderation_event_review_created_idx').on(t.reviewId, t.createdAt, t.id),
    index('review_moderation_event_actor_idx').on(t.actorUserId),
  ],
);

export const bookingNotificationOutbox = pgTable(
  'booking_notification_outbox',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bookingId: uuid('booking_id')
      .notNull()
      .unique()
      .references(() => consultationBooking.id, { onDelete: 'cascade' }),
    phoneNumber: text('phone_number').notNull(),
    requesterName: text('requester_name').notNull(),
    enqueuedAt: timestamp('enqueued_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('booking_notification_outbox_pending_idx')
      .on(t.createdAt, t.id)
      .where(sql`${t.enqueuedAt} IS NULL`),
  ],
);

/** One organization-owned KYC application with a reviewable lifecycle. */
export const verificationApplication = pgTable(
  'verification_application',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: text('organization_id')
      .notNull()
      .unique()
      .references(() => organization.id, { onDelete: 'cascade' }),
    status: verificationApplicationStatusEnum('status')
      .default(VERIFICATION_APPLICATION_STATUS.DRAFT)
      .notNull(),
    attempt: integer('attempt').default(1).notNull(),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    reviewedByUserId: text('reviewed_by_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    check('verification_application_attempt_check', sql`${t.attempt} >= 1`),
    check(
      'verification_application_lifecycle_check',
      sql`
        (${t.status} = 'draft' AND ${t.submittedAt} IS NULL AND ${t.reviewedAt} IS NULL
          AND ${t.approvedAt} IS NULL AND ${t.expiresAt} IS NULL)
        OR (${t.status} = 'pending' AND ${t.submittedAt} IS NOT NULL AND ${t.reviewedAt} IS NULL
          AND ${t.approvedAt} IS NULL AND ${t.expiresAt} IS NULL)
        OR (${t.status} = 'rejected' AND ${t.submittedAt} IS NOT NULL AND ${t.reviewedAt} IS NOT NULL
          AND ${t.approvedAt} IS NULL AND ${t.expiresAt} IS NULL)
        OR (${t.status} = 'verified' AND ${t.submittedAt} IS NOT NULL AND ${t.reviewedAt} IS NOT NULL
          AND ${t.approvedAt} IS NOT NULL AND ${t.expiresAt} IS NOT NULL)
      `,
    ),
    index('verification_application_pending_queue_idx')
      .on(t.submittedAt, t.id)
      .where(sql`${t.status} = 'pending'`),
    index('verification_application_verified_expiry_idx')
      .on(t.expiresAt, t.id)
      .where(sql`${t.status} = 'verified'`),
    index('verification_application_verified_review_queue_idx')
      .on(t.reviewedAt, t.id)
      .where(sql`${t.status} = 'verified'`),
    index('verification_application_rejected_review_queue_idx')
      .on(t.reviewedAt, t.id)
      .where(sql`${t.status} = 'rejected'`),
    index('verification_application_reviewer_idx').on(t.reviewedByUserId),
  ],
);

/** Stable logical document slots; replacements create immutable versions below. */
export const verificationDocumentSlot = pgTable(
  'verification_document_slot',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    applicationId: uuid('application_id')
      .notNull()
      .references(() => verificationApplication.id, { onDelete: 'cascade' }),
    type: verificationDocumentTypeEnum('type').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('verification_document_slot_application_type_uniq').on(t.applicationId, t.type),
  ],
);

/** Immutable document version metadata. R2 bytes stay private and are never public DTO fields. */
export const verificationDocumentVersion = pgTable(
  'verification_document_version',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slotId: uuid('slot_id')
      .notNull()
      .references(() => verificationDocumentSlot.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    objectKey: text('object_key').notNull().unique(),
    contentType: text('content_type').notNull(),
    contentLength: integer('content_length').notNull(),
    status: verificationDocumentStatusEnum('status')
      .default(VERIFICATION_DOCUMENT_STATUS.PENDING_UPLOAD)
      .notNull(),
    uploadedByUserId: text('uploaded_by_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    committedAt: timestamp('committed_at', { withTimezone: true }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    reviewedByUserId: text('reviewed_by_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    removedAt: timestamp('removed_at', { withTimezone: true }),
    removedByUserId: text('removed_by_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    check('verification_document_version_positive_check', sql`${t.version} >= 1`),
    check('verification_document_content_length_check', sql`${t.contentLength} > 0`),
    check(
      'verification_document_commit_check',
      sql`(${t.status} = 'pending_upload' AND ${t.committedAt} IS NULL)
        OR (${t.status} <> 'pending_upload' AND ${t.committedAt} IS NOT NULL)`,
    ),
    check(
      'verification_document_removal_check',
      sql`(${t.status}::text = 'removed' AND ${t.removedAt} IS NOT NULL)
        OR (${t.status}::text <> 'removed' AND ${t.removedAt} IS NULL)`,
    ),
    uniqueIndex('verification_document_version_slot_version_uniq').on(t.slotId, t.version),
    index('verification_document_version_uploader_idx').on(t.uploadedByUserId),
    index('verification_document_version_reviewer_idx').on(t.reviewedByUserId),
    index('verification_document_version_remover_idx').on(t.removedByUserId),
  ],
);

/** Append-only audit history for designer submissions and admin decisions. */
export const verificationReviewEvent = pgTable(
  'verification_review_event',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    applicationId: uuid('application_id')
      .notNull()
      .references(() => verificationApplication.id, { onDelete: 'restrict' }),
    attempt: integer('attempt').notNull(),
    action: verificationReviewActionEnum('action').notNull(),
    actorUserId: text('actor_user_id').references(() => user.id, { onDelete: 'set null' }),
    fromStatus: verificationApplicationStatusEnum('from_status').notNull(),
    toStatus: verificationApplicationStatusEnum('to_status').notNull(),
    note: text('note'),
    rejectedDocumentVersionIds: jsonb('rejected_document_version_ids')
      .$type<string[]>()
      .default([])
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    check('verification_review_event_attempt_check', sql`${t.attempt} >= 1`),
    index('verification_review_event_application_created_idx').on(
      t.applicationId,
      t.createdAt,
      t.id,
    ),
    index('verification_review_event_actor_idx').on(t.actorUserId),
  ],
);

/** Transactional email intent; the worker is responsible for durable delivery. */
export const verificationNotificationOutbox = pgTable(
  'verification_notification_outbox',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    applicationId: uuid('application_id')
      .notNull()
      .references(() => verificationApplication.id, { onDelete: 'cascade' }),
    attempt: integer('attempt').notNull(),
    eventType: verificationNotificationEventEnum('event_type').notNull(),
    recipientUserId: text('recipient_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    recipientEmail: text('recipient_email').notNull(),
    note: text('note'),
    enqueuedAt: timestamp('enqueued_at', { withTimezone: true }),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    deliveryAttempts: integer('delivery_attempts').default(0).notNull(),
    failedAt: timestamp('failed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    check('verification_notification_attempt_check', sql`${t.attempt} >= 1`),
    check('verification_notification_delivery_attempts_check', sql`${t.deliveryAttempts} >= 0`),
    uniqueIndex('verification_notification_application_attempt_event_uniq').on(
      t.applicationId,
      t.attempt,
      t.eventType,
    ),
    index('verification_notification_pending_idx')
      .on(t.createdAt, t.id)
      .where(sql`${t.sentAt} IS NULL AND ${t.failedAt} IS NULL AND ${t.enqueuedAt} IS NULL`),
    index('verification_notification_stale_idx')
      .on(t.enqueuedAt, t.createdAt, t.id)
      .where(sql`${t.sentAt} IS NULL AND ${t.failedAt} IS NULL AND ${t.enqueuedAt} IS NOT NULL`),
    index('verification_notification_recipient_idx').on(t.recipientUserId),
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
    // Immutable pipeline provenance. The matched image may later be deleted, so this is not an FK.
    duplicateOfImageId: uuid('duplicate_of_image_id'),
    duplicateDistance: integer('duplicate_distance'),
    duplicateCheckedAt: timestamp('duplicate_checked_at'),
    status: projectImageStatusEnum('status').default('processing').notNull(),
    sortOrder: integer('sort_order').default(0).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    index('project_image_project_idx').on(t.projectId),
    index('project_image_room_idx').on(t.roomId),
    index('project_image_theme_slugs_gin').using('gin', t.themeSlugs),
    // Covers the list query's ORDER BY (project_id, sort_order, created_at) so it's an index scan.
    index('project_image_project_sort_idx').on(t.projectId, t.sortOrder, t.createdAt),
    check(
      'project_image_duplicate_distance_nonnegative',
      sql`${t.duplicateDistance} is null or ${t.duplicateDistance} >= 0`,
    ),
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
    // Per-source controls. The generic fields above stay for one compatibility
    // cycle and are mirrored to both source groups when older clients patch them.
    showTickifReviews: boolean('show_tickif_reviews').default(true).notNull(),
    showTickifOverallRating: boolean('show_tickif_overall_rating').default(true).notNull(),
    showTickifPositiveReviewsOnly: boolean('show_tickif_positive_reviews_only')
      .default(false)
      .notNull(),
    showGoogleReviews: boolean('show_google_reviews').default(true).notNull(),
    showGoogleOverallRating: boolean('show_google_overall_rating').default(true).notNull(),
    showGooglePositiveReviewsOnly: boolean('show_google_positive_reviews_only')
      .default(false)
      .notNull(),

    // Share block
    showTickifBadge: boolean('show_tickif_badge').default(true).notNull(),

    // Timestamps
    publishedAt: timestamp('published_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  // No explicit indexes needed — UNIQUE constraints create B-tree indexes
);

// Connection lifecycle for a designer's linked Google Business place.
//   pending   — place_id resolved, first fetch not completed yet
//   connected — last fetch succeeded and cached payload is fresh
//   error     — last fetch failed (retryable; payload may still be usable)
//   stale     — cached review payload purged (>30d ToS window or repeated failure);
//               place_id is retained (ToS-safe to keep indefinitely)
export const googlePlaceStatusEnum = pgEnum('google_place_status', [
  'pending',
  'connected',
  'error',
  'stale',
]);

/**
 * Persisted shape of a cached Google review. Mirrors `GooglePlaceReview` in
 * `@repo/google-places` — kept structural here so the db package takes no
 * runtime dependency on the Places client.
 */
export type GooglePlaceReviewRecord = {
  author: string;
  authorUrl: string | null;
  profilePhotoUrl: string | null;
  rating: number;
  relativeTime: string;
  text: string;
  time: number;
};

/**
 * Cache of a designer's Google rating + recent reviews (E — Google reviews).
 *
 * One row per profile (profileId is the PK). Google's Places ToS forbids caching
 * review *content* beyond 30 days, so `reviews`/`rating` are treated as a
 * short-lived cache refreshed by the worker sweep; `placeId` alone is durable.
 */
export const googlePlaceCache = pgTable(
  'google_place_cache',
  {
    profileId: uuid('profile_id')
      .primaryKey()
      .references(() => designerProfile.id, { onDelete: 'cascade' }),
    placeId: text('place_id').notNull(),
    // Google aggregate rating (0.0–5.0) and total number of ratings.
    rating: numeric('rating', { precision: 2, scale: 1 }),
    userRatingsTotal: integer('user_ratings_total'),
    // Up to 5 recent reviews (Google's Place Details cap). ToS-limited to ≤30d.
    reviews: jsonb('reviews').$type<GooglePlaceReviewRecord[]>().default([]).notNull(),
    status: googlePlaceStatusEnum('status').default('pending').notNull(),
    lastFetchedAt: timestamp('last_fetched_at', { withTimezone: true }),
    // Last time the designer triggered a connect/refresh. Drives a per-profile
    // cooldown so nobody can loop the (billable) Places calls on the shared key.
    lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true }),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    // Drives the worker sweep: "rows of status X not fetched since T".
    index('google_place_cache_status_fetched_idx').on(t.status, t.lastFetchedAt),
  ],
);

// --- Subscription & Billing (E-114) ---

/**
 * Plan tier enum — order is the ranking contract.
 * Corporate > Professional+ > Hobby.
 * Postgres enum values must be appended, never reordered.
 */
export const planTierEnum = pgEnum('plan_tier', PLAN_TIER_VALUES);

/**
 * Subscription lifecycle state — separate from Razorpay's raw status.
 * State machine: active → payment_failed → grace → locked → downgraded
 * (can return to active from any lapsed state via the lifecycle worker).
 */
export const subscriptionStateEnum = pgEnum('subscription_state', SUBSCRIPTION_STATE_VALUES);

/**
 * One active subscription per organization (enforced by unique organizationId).
 * Updated in-place as the subscription progresses through its lifecycle.
 * Payment history is tracked in payment_transaction.
 *
 * Voluntary cancellation (user downgrades to Hobby) is represented as:
 *   subscriptionState = 'active', planTier = 'hobby'
 * The 'downgraded' state is reserved exclusively for the involuntary lapse terminal
 * stage (payment_failed → grace → locked → downgraded). It preserves pre_lapse_tier
 * for restoration if the org reactivates.
 */
export const subscription = pgTable(
  'subscription',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: text('organization_id')
      .notNull()
      .unique()
      .references(() => organization.id, { onDelete: 'cascade' }),
    planTier: planTierEnum('plan_tier').notNull(),
    subscriptionState: subscriptionStateEnum('subscription_state').notNull().default('active'),
    razorpaySubscriptionId: text('razorpay_subscription_id').unique(),
    razorpayStatus: text('razorpay_status'),
    cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
    graceStartedAt: timestamp('grace_started_at', { withTimezone: true }),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    downgradedAt: timestamp('downgraded_at', { withTimezone: true }),
    preLapseTier: planTierEnum('pre_lapse_tier'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    // Sweep indexes for the lifecycle worker (E-239):
    // Find grace-period subscriptions past their window
    index('subscription_grace_sweep_idx')
      .on(t.subscriptionState, t.graceStartedAt)
      .where(sql`${t.subscriptionState} = 'grace'`),
    // Find locked subscriptions past their window
    index('subscription_locked_sweep_idx')
      .on(t.subscriptionState, t.lockedAt)
      .where(sql`${t.subscriptionState} = 'locked'`),
    // Lifecycle data integrity: each state requires its corresponding timestamps
    // and downstream lapse states require pre_lapse_tier for restoration.
    check(
      'subscription_lifecycle_check',
      sql`
        (
          ${t.subscriptionState} = 'active'
          AND ${t.graceStartedAt} IS NULL
          AND ${t.lockedAt} IS NULL
          AND ${t.downgradedAt} IS NULL
          AND ${t.preLapseTier} IS NULL
        )
        OR (
          ${t.subscriptionState} = 'payment_failed'
          AND ${t.graceStartedAt} IS NULL
          AND ${t.lockedAt} IS NULL
          AND ${t.downgradedAt} IS NULL
          AND ${t.preLapseTier} IS NULL
        )
        OR (
          ${t.subscriptionState} = 'grace'
          AND ${t.graceStartedAt} IS NOT NULL
          AND ${t.lockedAt} IS NULL
          AND ${t.downgradedAt} IS NULL
          AND ${t.preLapseTier} IS NOT NULL
          AND ${t.preLapseTier} <> 'hobby'
          AND ${t.planTier} = ${t.preLapseTier}
        )
        OR (
          ${t.subscriptionState} = 'locked'
          AND ${t.graceStartedAt} IS NOT NULL
          AND ${t.lockedAt} IS NOT NULL
          AND ${t.downgradedAt} IS NULL
          AND ${t.preLapseTier} IS NOT NULL
          AND ${t.preLapseTier} <> 'hobby'
          AND ${t.planTier} = ${t.preLapseTier}
        )
        OR (
          ${t.subscriptionState} = 'downgraded'
          AND ${t.graceStartedAt} IS NOT NULL
          AND ${t.lockedAt} IS NOT NULL
          AND ${t.downgradedAt} IS NOT NULL
          AND ${t.preLapseTier} IS NOT NULL
          AND ${t.preLapseTier} <> 'hobby'
          AND ${t.planTier} = 'hobby'
        )
      `,
    ),
    // Timestamp ordering: grace → locked → downgraded must be chronological
    check(
      'subscription_timestamp_order_check',
      sql`
        (${t.lockedAt} IS NULL OR ${t.graceStartedAt} IS NULL OR ${t.lockedAt} >= ${t.graceStartedAt})
        AND (${t.downgradedAt} IS NULL OR ${t.lockedAt} IS NULL OR ${t.downgradedAt} >= ${t.lockedAt})
      `,
    ),
  ],
);

/**
 * Payment transaction audit log — one row per Razorpay **payment** event.
 *
 * Scope: This table stores only events that carry a `payment` entity
 * (e.g. payment.authorized, payment.captured, payment.failed). The
 * `razorpay_payment_id` column is NOT NULL UNIQUE and serves as the
 * idempotency key for deduplication.
 *
 * Non-payment webhook events (subscription.activated, subscription.halted,
 * subscription.cancelled, subscription.pending) do NOT contain a payment
 * entity and therefore do NOT belong here. Those events are handled by
 * E-117's webhook-event audit/idempotency table, which uses the Razorpay
 * event ID as its idempotency key instead.
 *
 * Amount is stored in paise (integer): ₹2,999 = 299900.
 */
export const paymentTransaction = pgTable(
  'payment_transaction',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    subscriptionId: uuid('subscription_id')
      .notNull()
      .references(() => subscription.id, { onDelete: 'cascade' }),
    razorpayPaymentId: text('razorpay_payment_id').notNull().unique(),
    amount: integer('amount').notNull(),
    currency: text('currency').notNull().default('INR'),
    status: text('status').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    index('payment_transaction_subscription_idx').on(t.subscriptionId),
    index('payment_transaction_status_idx').on(t.status),
    check('payment_transaction_amount_nonnegative', sql`${t.amount} >= 0`),
  ],
);
