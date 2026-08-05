import type {
  CreateProjectInput,
  CreateProjectRoomInput,
  DeleteProjectImageResponse,
  DeleteProjectResponse,
  DeleteProjectRoomResponse,
  DesignerProjectCard,
  DesignerProjectsQuery,
  DesignerProjectsResponse,
  DuplicateProjectResponse,
  LinkProjectImageInput,
  ListProjectRoomsResponse,
  ListProjectsQuery,
  ModerationAction,
  ModerationHistoryResponse,
  FeedProjectsQuery,
  FeedProjectsResponse,
  ProjectCompletenessResponse,
  ProjectDetailResponse,
  ProjectImageAttachment,
  ProjectListItem,
  PortfolioProjectItem,
  PortfolioProjectsQuery,
  PortfolioProjectsResponse,
  PortfolioProjectStatusCounts,
  PortfolioProjectStatusGroup,
  ProjectResponse,
  PublicProjectBySlugResponse,
  ListProjectsResponse,
  ProjectRoom,
  ProjectStatus,
  ReorderProjectRoomsInput,
  SimilarProjectsResponse,
  UpdateProjectInput,
  UpdateProjectRoomInput,
  Derivative,
} from '@repo/contracts';
import { deleteObject, presignDownload } from '@repo/storage';
import { AppError } from '../../lib/errors.js';
import { orgsService } from '../orgs/service.js';
import {
  projectsRepository,
  type ProjectCoverImageRecord,
  type ProjectFeedItemRecord,
  type ProjectImageAttachmentRecord,
  type ProjectImageDeletionRecord,
  type ProjectListItemRecord,
  type ProjectModerationEventRecord,
  type ProjectOwnership,
  type ProjectRecord,
  type ProjectRoomRecord,
  type ProjectStatusCountRecord,
  type TaxonomyKind,
} from './repository.js';

/**
 * Project use-cases. Business logic lives here and imports NEITHER Hono NOR
 * Drizzle — only the repository and shared contracts. This keeps the layer
 * unit-testable with a fake repository and free to move to its own service.
 */

const REQUIRED_PROJECT_PHOTO_COUNT = 3;
const PHOTO_COMPLETENESS_KEYS = new Set(['at-least-three-photos', 'image-metadata']);

function toResponse(row: ProjectRecord): ProjectResponse {
  return {
    id: row.id,
    designerId: row.designerId,
    title: row.title,
    slug: row.slug,
    description: row.description,
    status: row.status,
    rejectionReasonCode: row.rejectionReasonCode,
    moderationNote: row.moderationNote,
    propertyTypeSlug: row.propertyTypeSlug,
    propertySubtypeSlug: row.propertySubtypeSlug,
    scopeSlug: row.scopeSlug,
    bhkSlug: row.bhkSlug,
    sizeSqft: row.sizeSqft,
    citySlug: row.citySlug,
    localitySlug: row.localitySlug,
    buildingName: row.buildingName,
    budgetBandSlug: row.budgetBandSlug,
    coverImageId: row.coverImageId,
    completedMonth: row.completedMonth,
    durationMonths: row.durationMonths,
    metadata: row.metadata ?? null,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    submittedAt: row.submittedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toRoomResponse(row: ProjectRoomRecord): ProjectRoom {
  return {
    id: row.id,
    projectId: row.projectId,
    roomTypeId: row.roomTypeId,
    name: row.name,
    description: row.description,
    sortOrder: row.sortOrder,
    metadata: row.metadata ?? {},
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toDetailResponse(row: ProjectRecord, rooms: ProjectRoomRecord[]): ProjectDetailResponse {
  return {
    ...toResponse(row),
    rooms: rooms.map(toRoomResponse),
  };
}

function toImageAttachment(row: ProjectImageAttachmentRecord): ProjectImageAttachment {
  return {
    id: row.id,
    projectId: row.projectId,
    roomId: row.roomId,
    status: row.status,
    sortOrder: row.sortOrder,
  };
}

function toImageDeletion(row: ProjectImageDeletionRecord): DeleteProjectImageResponse {
  return { id: row.id, deleted: true };
}

async function deleteImageObjects(row: ProjectImageDeletionRecord): Promise<void> {
  const keys = [
    ...new Set(
      [row.originalKey, ...row.derivatives.map((derivative) => derivative.key)].filter(
        (key): key is string => Boolean(key),
      ),
    ),
  ];
  const referencedKeys = new Set(await projectsRepository.findReferencedImageObjectKeys(keys));
  const unusedKeys = keys.filter((key) => !referencedKeys.has(key));

  await Promise.allSettled(unusedKeys.map((key) => deleteObject(key)));
}

function pickPreviewDerivative(derivatives: Derivative[]): Derivative | null {
  return (
    derivatives.find(
      (derivative) => derivative.variant === 'thumb' && derivative.format === 'webp',
    ) ??
    derivatives.find((derivative) => derivative.variant === 'thumb') ??
    derivatives[0] ??
    null
  );
}

/** Pick the best derivative for fullscreen gallery display (largest available, never original). */
function pickGalleryDerivative(derivatives: Derivative[]): string | null {
  return (
    derivatives.find((derivative) => derivative.variant === 'large' && derivative.format === 'webp')
      ?.key ??
    derivatives.find((derivative) => derivative.variant === 'large')?.key ??
    derivatives.find(
      (derivative) => derivative.variant === 'medium' && derivative.format === 'webp',
    )?.key ??
    derivatives.find((derivative) => derivative.variant === 'medium')?.key ??
    derivatives.find((derivative) => derivative.variant === 'thumb' && derivative.format === 'webp')
      ?.key ??
    derivatives.find((derivative) => derivative.variant === 'thumb')?.key ??
    derivatives[0]?.key ??
    null
  );
}

/**
 * The single "when does a cover have a URL" policy, shared by the dashboard list and the
 * public feed. Accepts the left-join nulls the feed carries. Callers that must not fail the
 * whole response on a presign error append `.catch(() => null)`.
 */
async function coverImageUrl(coverImage?: {
  status: ProjectFeedItemRecord['coverStatus'];
  derivatives: ProjectFeedItemRecord['coverDerivatives'];
}): Promise<string | null> {
  if (!coverImage || coverImage.status !== 'ready' || !coverImage.derivatives) return null;
  const preview = pickPreviewDerivative(coverImage.derivatives);
  return preview ? presignDownload({ key: preview.key }) : null;
}

function toFeedProject(
  row: ProjectFeedItemRecord,
  labels: Map<string, string>,
  localityLabels: Map<string, string>,
  coverImageUrl: string | null,
): FeedProjectsResponse['projects'][number] {
  const labelOf = (kind: TaxonomyKind, slug: string | null): string | null =>
    slug ? (labels.get(`${kind}:${slug}`) ?? null) : null;

  const tags = [
    labelOf('bhk', row.bhkSlug),
    labelOf('scope', row.scopeSlug) ?? labelOf('property_subtype', row.propertySubtypeSlug),
  ].filter((tag): tag is string => !!tag);

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    studio: row.studio,
    city: labelOf('city', row.citySlug),
    locality:
      row.citySlug && row.localitySlug
        ? (localityLabels.get(`${row.citySlug}:${row.localitySlug}`) ?? null)
        : null,
    rating: Number(row.rating) || 0,
    reviewCount: row.reviewCount,
    budget: labelOf('budget_band', row.budgetBandSlug),
    tags,
    coverImageUrl,
    imageWidth: row.coverWidth,
    imageHeight: row.coverHeight,
  };
}

/**
 * Year a project was completed. `completed_month` is free text captured during
 * upload (e.g. "2024-06" or "June 2024"), so read the first 4-digit run and fall
 * back to the publish year. Returns null when neither yields a plausible year.
 */
function completionYearOf(row: ProjectFeedItemRecord): number | null {
  const matched = row.completedMonth?.match(/\d{4}/)?.[0];
  const year = matched ? Number(matched) : row.publishedAt?.getUTCFullYear();
  if (!year || year < 1900 || year > 2200) return null;
  return year;
}

/**
 * Designer-portfolio card projection: the feed card plus the display and sort
 * fields the public portfolio gallery needs.
 */
function toDesignerProjectCard(
  row: ProjectFeedItemRecord,
  labels: Map<string, string>,
  localityLabels: Map<string, string>,
  coverImageUrl: string | null,
): DesignerProjectCard {
  const labelOf = (kind: TaxonomyKind, slug: string | null): string | null =>
    slug ? (labels.get(`${kind}:${slug}`) ?? null) : null;

  // "4 BHK · Apartment" — either part may be missing.
  const propertyType =
    [labelOf('bhk', row.bhkSlug), labelOf('property_subtype', row.propertySubtypeSlug)]
      .filter((part): part is string => !!part)
      .join(' · ') || null;

  return {
    ...toFeedProject(row, labels, localityLabels, coverImageUrl),
    propertyType,
    completionYear: completionYearOf(row),
    sizeSqft: row.sizeSqft,
  };
}

/** Non-hierarchical (kind, slug) taxonomy pairs a feed row needs resolved (locality handled separately). */
function feedTaxonomyPairs(row: ProjectFeedItemRecord): { kind: TaxonomyKind; slug: string }[] {
  const pairs: { kind: TaxonomyKind; slug: string }[] = [];
  if (row.citySlug) pairs.push({ kind: 'city', slug: row.citySlug });
  if (row.budgetBandSlug) pairs.push({ kind: 'budget_band', slug: row.budgetBandSlug });
  if (row.bhkSlug) pairs.push({ kind: 'bhk', slug: row.bhkSlug });
  if (row.scopeSlug) pairs.push({ kind: 'scope', slug: row.scopeSlug });
  if (row.propertySubtypeSlug)
    pairs.push({ kind: 'property_subtype', slug: row.propertySubtypeSlug });
  return pairs;
}

/** City-scoped locality pairs; empty unless the row has both a city and a locality. */
function feedLocalityPairs(
  row: ProjectFeedItemRecord,
): { citySlug: string; localitySlug: string }[] {
  return row.citySlug && row.localitySlug
    ? [{ citySlug: row.citySlug, localitySlug: row.localitySlug }]
    : [];
}

function toListItemFields(
  row: ProjectListItemRecord,
  coverImageUrl: string | null,
): ProjectListItem {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    propertyType: row.propertySubtypeSlug ?? row.propertyTypeSlug,
    city: row.citySlug,
    locality: row.localitySlug,
    status: row.status,
    rejectionReasonCode: row.rejectionReasonCode,
    moderationNote: row.moderationNote,
    coverImageUrl,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function toListItem(
  row: ProjectListItemRecord,
  coverImages: Map<string, ProjectCoverImageRecord>,
): Promise<ProjectListItem> {
  const cover = row.coverImageId ? coverImages.get(row.coverImageId) : undefined;
  return toListItemFields(row, await coverImageUrl(cover));
}

async function toPortfolioItem(
  row: ProjectListItemRecord,
  coverImages: Map<string, ProjectCoverImageRecord>,
): Promise<PortfolioProjectItem> {
  const cover = row.coverImageId ? coverImages.get(row.coverImageId) : undefined;
  const preview =
    cover?.status === 'ready' && cover.derivatives
      ? pickPreviewDerivative(cover.derivatives)
      : null;
  const url = preview ? await presignDownload({ key: preview.key }) : null;

  return {
    ...toListItemFields(row, url),
    statusGroup: portfolioStatusGroup(row.status),
    coverImage:
      cover && preview && url
        ? {
            id: cover.id,
            url,
            width: preview.width,
            height: preview.height,
          }
        : null,
  };
}

function portfolioStatusGroup(status: ProjectStatus): PortfolioProjectStatusGroup {
  if (status === 'submitted' || status === 'in_review') return 'in_review';
  return status;
}

function buildPortfolioStatusCounts(
  counts: ProjectStatusCountRecord[],
): PortfolioProjectStatusCounts {
  const count = (statuses: ProjectStatus[]): number =>
    counts
      .filter((item) => statuses.includes(item.status))
      .reduce((sum, item) => sum + item.count, 0);

  return {
    total: counts.reduce((sum, item) => sum + item.count, 0),
    draft: count(['draft']),
    inReview: count(['submitted', 'in_review']),
    published: count(['published']),
    changesRequested: count(['changes_requested']),
    rejected: count(['rejected']),
  };
}

/** The authenticated caller, as resolved by the route from the session. */
export type Caller = {
  userId: string;
  userRole: string;
  isBanned: boolean;
  activeOrgId: string | null;
};

export type TransitionCaller = Pick<Caller, 'userId' | 'userRole'>;

type TransitionRule = {
  actorRole: 'designer' | 'admin' | 'superadmin';
  fromStatus: ProjectStatus;
  toStatus: ProjectStatus;
  action: ModerationAction;
};

const transitionRules: TransitionRule[] = [
  { actorRole: 'designer', fromStatus: 'draft', toStatus: 'submitted', action: 'submit' },
  {
    actorRole: 'designer',
    fromStatus: 'changes_requested',
    toStatus: 'submitted',
    action: 'resubmit',
  },
  { actorRole: 'designer', fromStatus: 'rejected', toStatus: 'submitted', action: 'resubmit' },
  { actorRole: 'designer', fromStatus: 'submitted', toStatus: 'draft', action: 'withdraw' },
  { actorRole: 'admin', fromStatus: 'submitted', toStatus: 'in_review', action: 'start_review' },
  { actorRole: 'admin', fromStatus: 'in_review', toStatus: 'published', action: 'publish' },
  {
    actorRole: 'admin',
    fromStatus: 'in_review',
    toStatus: 'changes_requested',
    action: 'request_changes',
  },
  { actorRole: 'admin', fromStatus: 'in_review', toStatus: 'rejected', action: 'reject' },
  { actorRole: 'admin', fromStatus: 'published', toStatus: 'in_review', action: 'unpublish' },
  {
    actorRole: 'superadmin',
    fromStatus: 'submitted',
    toStatus: 'in_review',
    action: 'start_review',
  },
  {
    actorRole: 'superadmin',
    fromStatus: 'in_review',
    toStatus: 'published',
    action: 'publish',
  },
  {
    actorRole: 'superadmin',
    fromStatus: 'in_review',
    toStatus: 'changes_requested',
    action: 'request_changes',
  },
  {
    actorRole: 'superadmin',
    fromStatus: 'in_review',
    toStatus: 'rejected',
    action: 'reject',
  },
  {
    actorRole: 'superadmin',
    fromStatus: 'published',
    toStatus: 'in_review',
    action: 'unpublish',
  },
  // assertAccess already waves superadmin through every ownership gate, so without this row
  // POST /{id}/withdraw was reachable for them but always 409'd — the one action in the matrix
  // superadmin could not perform.
  { actorRole: 'superadmin', fromStatus: 'submitted', toStatus: 'draft', action: 'withdraw' },
];

export function assertTransition(
  fromStatus: ProjectStatus,
  toStatus: ProjectStatus,
  actorRole: string,
): ModerationAction {
  const rule = transitionRules.find(
    (candidate) =>
      candidate.actorRole === actorRole &&
      candidate.fromStatus === fromStatus &&
      candidate.toStatus === toStatus,
  );
  if (!rule) {
    throw AppError.invalidTransition(
      `${actorRole || 'unknown'} cannot transition a project from ${fromStatus} to ${toStatus}`,
    );
  }
  return rule.action;
}

export async function transitionProject(
  input: {
    projectId: string;
    toStatus: ProjectStatus;
    note?: string | null;
    reasonCode?: string | null;
    patch?: Parameters<typeof projectsRepository.transition>[0]['patch'];
    expectedModerationRevision?: number;
  },
  caller: TransitionCaller,
): Promise<ProjectRecord> {
  const project = await projectsRepository.findById(input.projectId);
  if (!project) throw AppError.notFound('Project not found');
  const action = assertTransition(project.status, input.toStatus, caller.userRole);

  const transitioned = await projectsRepository.transition({
    id: input.projectId,
    fromStatus: project.status,
    toStatus: input.toStatus,
    actorUserId: caller.userId,
    action,
    note: input.note,
    reasonCode: input.reasonCode,
    patch: input.patch,
    expectedModerationRevision: input.expectedModerationRevision,
  });
  if (!transitioned) throw AppError.invalidTransition();
  return transitioned;
}

function toModerationHistoryItem(
  row: ProjectModerationEventRecord,
): ModerationHistoryResponse['items'][number] {
  return {
    id: row.id,
    action: row.action,
    fromStatus: row.fromStatus,
    toStatus: row.toStatus,
    actorLabel: 'Tickif Review Team',
    note: row.note,
    reasonCode: row.reasonCode,
    fieldDiff: row.fieldDiff,
    createdAt: row.createdAt.toISOString(),
  };
}

function requireActiveOrganization(caller: Caller): string {
  if (!caller.activeOrgId) {
    throw AppError.unprocessable('No active organization selected');
  }
  return caller.activeOrgId;
}

function assertAccess(ownership: ProjectOwnership, caller: Caller): void {
  if (caller.isBanned) throw AppError.forbidden('Account suspended');
  if (caller.userRole === 'superadmin') return;
  if (ownership.ownerUserId && ownership.ownerUserId === caller.userId) return;
  throw AppError.forbidden();
}

function isEditableProjectStatus(status: ProjectRecord['status']): boolean {
  return status === 'draft' || status === 'changes_requested' || status === 'rejected';
}

async function requireEditableProject(
  projectId: string,
  caller: Caller,
): Promise<ProjectOwnership> {
  const ownership = await projectsRepository.findOwnership(projectId);
  if (!ownership) throw AppError.notFound('Project not found');
  await assertAccess(ownership, caller);
  if (!isEditableProjectStatus(ownership.status)) {
    throw AppError.conflict('Only draft or changes-requested projects can be edited');
  }
  return ownership;
}

async function requireReadableProject(projectId: string, caller: Caller): Promise<ProjectRecord> {
  const project = await projectsRepository.findById(projectId);
  if (!project) throw AppError.notFound('Project not found');
  if (project.status === 'published') return project;

  const ownership = await projectsRepository.findOwnership(projectId);
  if (!ownership) throw AppError.notFound('Project not found');
  await assertAccess(ownership, caller);
  return project;
}

export async function validateProjectTaxonomy(
  input: {
    propertyTypeSlug?: string | null;
    propertySubtypeSlug?: string | null;
    scopeSlug?: string | null;
    bhkSlug?: string | null;
    citySlug?: string | null;
    localitySlug?: string | null;
    budgetBandSlug?: string | null;
  },
  existing?: Pick<
    ProjectRecord,
    'citySlug' | 'localitySlug' | 'propertyTypeSlug' | 'propertySubtypeSlug'
  >,
): Promise<void> {
  if (
    input.propertyTypeSlug !== undefined &&
    input.propertyTypeSlug !== null &&
    !(await projectsRepository.taxonomyExists('property_type', { slug: input.propertyTypeSlug }))
  ) {
    throw AppError.unprocessable('Invalid propertyTypeSlug');
  }

  const propertySubtypeTouched =
    input.propertySubtypeSlug !== undefined || input.propertyTypeSlug !== undefined;
  const nextPropertyTypeSlug =
    input.propertyTypeSlug === undefined
      ? (existing?.propertyTypeSlug ?? null)
      : input.propertyTypeSlug;
  const nextPropertySubtypeSlug =
    input.propertySubtypeSlug === undefined
      ? (existing?.propertySubtypeSlug ?? null)
      : input.propertySubtypeSlug;
  if (
    propertySubtypeTouched &&
    nextPropertySubtypeSlug !== null &&
    !(await projectsRepository.propertySubtypeExists({
      subtypeSlug: nextPropertySubtypeSlug,
      propertyTypeSlug: nextPropertyTypeSlug,
    }))
  ) {
    throw AppError.unprocessable('Invalid propertySubtypeSlug');
  }

  if (
    input.scopeSlug !== undefined &&
    input.scopeSlug !== null &&
    !(await projectsRepository.taxonomyExists('scope', { slug: input.scopeSlug }))
  ) {
    throw AppError.unprocessable('Invalid scopeSlug');
  }

  if (
    input.bhkSlug !== undefined &&
    input.bhkSlug !== null &&
    !(await projectsRepository.taxonomyExists('bhk', { slug: input.bhkSlug }))
  ) {
    throw AppError.unprocessable('Invalid bhkSlug');
  }

  if (
    input.citySlug !== undefined &&
    input.citySlug !== null &&
    !(await projectsRepository.taxonomyExists('city', { slug: input.citySlug }))
  ) {
    throw AppError.unprocessable('Invalid citySlug');
  }

  const localityTouched = input.localitySlug !== undefined || input.citySlug !== undefined;
  const nextCitySlug = input.citySlug === undefined ? (existing?.citySlug ?? null) : input.citySlug;
  const nextLocalitySlug =
    input.localitySlug === undefined ? (existing?.localitySlug ?? null) : input.localitySlug;
  if (localityTouched && nextLocalitySlug !== null) {
    if (!nextCitySlug) {
      throw AppError.unprocessable('citySlug is required with localitySlug');
    }
    if (
      !(await projectsRepository.localityExists({
        citySlug: nextCitySlug,
        localitySlug: nextLocalitySlug,
      }))
    ) {
      throw AppError.unprocessable('Invalid localitySlug');
    }
  }

  if (
    input.budgetBandSlug !== undefined &&
    input.budgetBandSlug !== null &&
    !(await projectsRepository.taxonomyExists('budget_band', { slug: input.budgetBandSlug }))
  ) {
    throw AppError.unprocessable('Invalid budgetBandSlug');
  }
}

function humanizeSlug(slug: string): string {
  return slug
    .split('-')
    .map((part) =>
      part.toLowerCase() === 'bhk' ? 'BHK' : part.charAt(0).toUpperCase() + part.slice(1),
    )
    .join(' ');
}

async function labelFor(
  kind: Parameters<typeof projectsRepository.findTaxonomyTermBySlug>[0],
  slug?: string | null,
): Promise<string | null> {
  if (!slug) return null;
  const term = await projectsRepository.findTaxonomyTermBySlug(kind, slug);
  return term?.label ?? humanizeSlug(slug);
}

async function buildProjectTitle(input: CreateProjectInput): Promise<string> {
  const explicit = input.title?.trim();
  if (explicit) return explicit;

  const [city, locality, propertyType, propertySubtype, bhk, budget] = await Promise.all([
    labelFor('city', input.citySlug),
    labelFor('locality', input.localitySlug),
    labelFor('property_type', input.propertyTypeSlug),
    labelFor('property_subtype', input.propertySubtypeSlug),
    labelFor('bhk', input.bhkSlug),
    labelFor('budget_band', input.budgetBandSlug),
  ]);

  const subject = input.buildingName?.trim() || locality || city || 'New Project';
  const descriptor = [bhk, budget, propertySubtype ?? propertyType].filter(
    (part): part is string => !!part,
  );
  const location = city ? ` in ${city}` : '';
  const title = `${subject}${descriptor.length ? ` - ${descriptor.join(' ')}` : ''}${location}`;
  return title.slice(0, 160);
}

function bhkCount(slug?: string | null): number {
  if (!slug) return 1;
  const match = /^([1-4])(?:-plus)?-bhk$/.exec(slug);
  if (!match) return 1;
  const count = Number(match[1]);
  return slug.includes('plus') ? Math.max(count, 4) : count;
}

type RoomPrefillSpec = {
  slug: string;
  name?: string;
  metadata?: CreateProjectRoomInput['metadata'];
};

function defaultRoomSlugs(metadata?: Record<string, unknown> | null): string[] {
  const value = metadata?.defaultRoomSlugs;
  if (!Array.isArray(value)) return [];
  return value.filter((slug): slug is string => typeof slug === 'string' && slug.length > 0);
}

function prefillMetadata(slug: string): CreateProjectRoomInput['metadata'] | undefined {
  if (slug === 'cabin') return { labels: ['Cabin 1'] };
  if (slug === 'guest-room') return { labels: ['Guest Room 1'] };
  return undefined;
}

function expandRoomPrefillSlugs(
  slugs: string[],
  project: Pick<ProjectRecord, 'bhkSlug'>,
): RoomPrefillSpec[] {
  return slugs.flatMap((slug): RoomPrefillSpec[] => {
    if (slug === 'bedroom') {
      return Array.from(
        { length: bhkCount(project.bhkSlug) },
        (_, index): RoomPrefillSpec => ({
          slug,
          name: index === 0 ? 'Master Bedroom' : `Bedroom ${index + 1}`,
          metadata: { labels: [index === 0 ? 'Master' : `Bedroom ${index + 1}`] },
        }),
      );
    }
    return [{ slug, metadata: prefillMetadata(slug) }];
  });
}

async function buildRoomPrefillSpecs(
  project: Pick<ProjectRecord, 'propertyTypeSlug' | 'propertySubtypeSlug' | 'bhkSlug'>,
): Promise<RoomPrefillSpec[]> {
  const [subtypeTerm, typeTerm] = await Promise.all([
    project.propertySubtypeSlug
      ? projectsRepository.findTaxonomyTermBySlug('property_subtype', project.propertySubtypeSlug)
      : null,
    project.propertyTypeSlug
      ? projectsRepository.findTaxonomyTermBySlug('property_type', project.propertyTypeSlug)
      : null,
  ]);
  const subtypeDefaults = defaultRoomSlugs(subtypeTerm?.metadata);
  const typeDefaults = defaultRoomSlugs(typeTerm?.metadata);
  return expandRoomPrefillSlugs(
    subtypeDefaults.length > 0 ? subtypeDefaults : typeDefaults,
    project,
  );
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === '23505'
  );
}

async function createDraftWithUniqueSlug(
  input: CreateProjectInput & { title: string },
  designerId: string,
): Promise<ProjectRecord> {
  const base = projectsRepository.slugify(input.title);
  const baseTaken = await projectsRepository.findBySlug(base);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const suffix = `${Date.now().toString(36).slice(-4)}${attempt === 0 ? '' : `-${attempt}`}`;
    const slug = attempt === 0 && !baseTaken ? base : `${base}-${suffix}`;
    try {
      return await projectsRepository.createDraft(input, designerId, slug);
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
  }
  return projectsRepository.createDraft(input, designerId, `${base}-${Date.now().toString(36)}`);
}

async function duplicateWithUniqueSlug(
  source: ProjectRecord,
  title: string,
): Promise<{ project: ProjectRecord; rooms: ProjectRoomRecord[] }> {
  const base = projectsRepository.slugify(title);
  const baseTaken = await projectsRepository.findBySlug(base);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const suffix = `${Date.now().toString(36).slice(-4)}${attempt === 0 ? '' : `-${attempt}`}`;
    const slug = attempt === 0 && !baseTaken ? base : `${base}-${suffix}`;
    try {
      return await projectsRepository.duplicateProject({ source, title, slug });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
  }
  return projectsRepository.duplicateProject({
    source,
    title,
    slug: `${base}-${Date.now().toString(36)}`,
  });
}

function statusesForList(status: ListProjectsQuery['status']): ProjectStatus[] | undefined {
  if (status === 'draft') return ['draft', 'changes_requested', 'rejected'];
  if (status === 'in_review') return ['submitted', 'in_review'];
  if (status === 'published') return ['published'];
  return undefined;
}

function statusesForPortfolio(
  status: PortfolioProjectsQuery['status'],
): ProjectStatus[] | undefined {
  if (status === 'in_review') return ['submitted', 'in_review'];
  if (status === 'all') return undefined;
  return [status];
}

function duplicateTitle(title: string): string {
  const suffix = ' Copy';
  if (title.length + suffix.length <= 160) return `${title}${suffix}`;
  return `${title.slice(0, 160 - suffix.length)}${suffix}`;
}

async function prefillRoomsIfEmpty(
  project: Pick<ProjectRecord, 'id' | 'propertyTypeSlug' | 'propertySubtypeSlug' | 'bhkSlug'>,
  existingRooms?: ProjectRoomRecord[],
): Promise<ProjectRoomRecord[]> {
  const rooms = existingRooms ?? (await projectsRepository.listRooms(project.id));
  if (rooms.length > 0) return rooms;

  const specs = await buildRoomPrefillSpecs(project);
  if (specs.length === 0) return rooms;
  const roomTypeSlugs = [...new Set(specs.map((spec) => spec.slug))];
  const roomTypes = await projectsRepository.findRoomTypesBySlugs(roomTypeSlugs);
  const roomTypeBySlug = new Map(roomTypes.map((term) => [term.slug, term]));
  const inputs = specs.flatMap((spec, index): CreateProjectRoomInput[] => {
    const term = roomTypeBySlug.get(spec.slug);
    if (!term) return [];
    return [
      {
        roomTypeId: term.id,
        name: spec.name ?? term.label,
        sortOrder: index,
        metadata: spec.metadata,
      },
    ];
  });
  return projectsRepository.createRooms(project.id, inputs);
}

async function validateRoomType(roomTypeId: string): Promise<void> {
  if (!(await projectsRepository.taxonomyExists('room', { id: roomTypeId }))) {
    throw AppError.unprocessable('Invalid roomTypeId');
  }
}

export function buildCompleteness(
  project: Pick<
    ProjectRecord,
    'title' | 'citySlug' | 'propertyTypeSlug' | 'scopeSlug' | 'budgetBandSlug'
  >,
  imageCounts: { imageCount: number; taggedImageCount: number },
): ProjectCompletenessResponse {
  const requirements = [
    { key: 'project-name', label: 'Project name', complete: project.title.trim().length > 0 },
    { key: 'location-city', label: 'Location city', complete: !!project.citySlug },
    { key: 'property-type', label: 'Property type', complete: !!project.propertyTypeSlug },
    { key: 'scope', label: 'Scope', complete: !!project.scopeSlug },
    { key: 'cost-range', label: 'Cost range', complete: !!project.budgetBandSlug },
    {
      key: 'at-least-three-photos',
      label: 'At least 3 photos',
      complete: imageCounts.imageCount >= 3,
    },
    {
      key: 'image-metadata',
      label: 'Room, theme, and finish metadata on each photo',
      complete:
        imageCounts.imageCount >= 3 && imageCounts.taggedImageCount === imageCounts.imageCount,
    },
  ];
  const completeCount = requirements.filter((requirement) => requirement.complete).length;
  return {
    complete: completeCount === requirements.length,
    score: Math.round((completeCount / requirements.length) * 100),
    missing: requirements
      .filter((requirement) => !requirement.complete)
      .map((requirement) => requirement.key),
    requirements,
  };
}

export const projectsService = {
  async list(query: ListProjectsQuery, caller: Caller): Promise<ListProjectsResponse> {
    if (caller.isBanned) throw AppError.forbidden('Account suspended');
    const activeOrgId = requireActiveOrganization(caller);
    if (!(await orgsService.isMember(caller.userId, activeOrgId))) {
      throw AppError.forbidden('Organization membership required');
    }
    const limit = query.limit;
    const page = query.page;
    const { items, total } = await projectsRepository.list({
      userId: caller.userId,
      activeOrgId,
      statuses: statusesForList(query.status),
      q: query.q,
      limit,
      offset: (page - 1) * limit,
      sort: query.sort,
    });
    const coverImages = await projectsRepository.findCoverImages(
      items.map((project) => project.coverImageId).filter((id): id is string => !!id),
    );

    return {
      items: await Promise.all(items.map((item) => toListItem(item, coverImages))),
      page,
      total,
      limit,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    };
  },

  async portfolio(
    query: PortfolioProjectsQuery,
    caller: Caller,
  ): Promise<PortfolioProjectsResponse> {
    if (caller.isBanned) throw AppError.forbidden('Account suspended');
    const activeOrgId = requireActiveOrganization(caller);
    if (!(await orgsService.isMember(caller.userId, activeOrgId))) {
      throw AppError.forbidden('Organization membership required');
    }
    const { page, limit } = query;
    const [{ items, total }, statusCounts] = await Promise.all([
      projectsRepository.list({
        userId: caller.userId,
        activeOrgId,
        statuses: statusesForPortfolio(query.status),
        limit,
        offset: (page - 1) * limit,
        sort: query.sort,
      }),
      projectsRepository.countByStatus({
        userId: caller.userId,
        activeOrgId,
      }),
    ]);
    const coverImages = await projectsRepository.findCoverImages(
      items.map((project) => project.coverImageId).filter((id): id is string => !!id),
    );

    return {
      items: await Promise.all(items.map((item) => toPortfolioItem(item, coverImages))),
      statusCounts: buildPortfolioStatusCounts(statusCounts),
      page,
      total,
      limit,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    };
  },

  /**
   * Public landing feed of published projects. No caller — anyone can read it.
   * Fetches limit+1 to compute `hasMore`, then resolves taxonomy labels and
   * cover URLs for the page in a single batched query (no N+1).
   */
  async feed(query: FeedProjectsQuery): Promise<FeedProjectsResponse> {
    const { page, limit } = query;
    const rows = await projectsRepository.listPublishedFeed({
      limit: limit + 1,
      offset: (page - 1) * limit,
    });
    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;

    const [labels, localityLabels] = await Promise.all([
      projectsRepository.findTaxonomyLabels(pageRows.flatMap(feedTaxonomyPairs)),
      projectsRepository.findLocalityLabels(pageRows.flatMap(feedLocalityPairs)),
    ]);

    const projects = await Promise.all(
      pageRows.map(async (row) => {
        const cover = await coverImageUrl({
          status: row.coverStatus,
          derivatives: row.coverDerivatives,
        }).catch(() => null);
        return toFeedProject(row, labels, localityLabels, cover);
      }),
    );

    return { projects, page, limit, hasMore };
  },

  async getById(id: string, caller?: Caller): Promise<ProjectDetailResponse> {
    const row = await projectsRepository.findByIdWithRooms(id);
    if (!row) throw AppError.notFound(`Project ${id} not found`);

    if (row.project.status !== 'published') {
      if (!caller) throw AppError.notFound(`Project ${id} not found`);
      const ownership = await projectsRepository.findOwnership(id);
      if (!ownership) throw AppError.notFound(`Project ${id} not found`);
      await assertAccess(ownership, caller);
    }

    return toDetailResponse(row.project, row.rooms);
  },

  async create(input: CreateProjectInput, caller: Caller): Promise<ProjectDetailResponse> {
    if (caller.isBanned) throw AppError.forbidden('Account suspended');
    if (caller.userRole !== 'designer') {
      throw AppError.forbidden('Designer role required');
    }
    const activeOrgId = requireActiveOrganization(caller);
    if (!(await orgsService.isWriter(caller.userId, activeOrgId))) {
      throw AppError.forbidden('Organization write access required');
    }
    await validateProjectTaxonomy(input);

    const designer = await projectsRepository.findDesignerByOrgId(activeOrgId);
    if (!designer) {
      throw AppError.forbidden('Designer profile required');
    }

    const title = await buildProjectTitle(input);
    const draftInput = { ...input, title };

    const row = await createDraftWithUniqueSlug(draftInput, designer.id);
    const rooms = await prefillRoomsIfEmpty(row, []);
    return toDetailResponse(row, rooms);
  },

  async update(
    projectId: string,
    input: UpdateProjectInput,
    caller: Caller,
  ): Promise<ProjectDetailResponse> {
    await requireEditableProject(projectId, caller);
    const existing = await projectsRepository.findById(projectId);
    if (!existing) throw AppError.notFound('Project not found');
    await validateProjectTaxonomy(input, existing);

    if (input.coverImageId) {
      const image = await projectsRepository.findImage(projectId, input.coverImageId);
      if (!image) throw AppError.unprocessable('Cover image must belong to the project');
    }

    const row = await projectsRepository.updateDraft(projectId, input);
    if (!row) throw AppError.notFound('Project not found');
    const rooms = await prefillRoomsIfEmpty(row);
    return toDetailResponse(row, rooms);
  },

  async delete(projectId: string, caller: Caller): Promise<DeleteProjectResponse> {
    await requireEditableProject(projectId, caller);
    const outcome = await projectsRepository.deleteProject(projectId);
    if (outcome === 'moderated') {
      throw AppError.conflict('Projects with moderation history cannot be deleted');
    }
    if (outcome === 'missing') {
      throw AppError.notFound('Project not found');
    }
    return { id: projectId, deleted: true };
  },

  async duplicate(projectId: string, caller: Caller): Promise<DuplicateProjectResponse> {
    const ownership = await projectsRepository.findOwnership(projectId);
    if (!ownership) throw AppError.notFound('Project not found');
    await assertAccess(ownership, caller);

    const source = await projectsRepository.findById(projectId);
    if (!source) throw AppError.notFound('Project not found');

    const duplicated = await duplicateWithUniqueSlug(source, duplicateTitle(source.title));
    return { project: toDetailResponse(duplicated.project, duplicated.rooms) };
  },

  async listRooms(projectId: string, caller: Caller): Promise<ListProjectRoomsResponse> {
    await requireEditableProject(projectId, caller);
    const rooms = await projectsRepository.listRooms(projectId);
    return { items: rooms.map(toRoomResponse) };
  },

  async createRoom(
    projectId: string,
    input: CreateProjectRoomInput,
    caller: Caller,
  ): Promise<ProjectRoom> {
    await requireEditableProject(projectId, caller);
    await validateRoomType(input.roomTypeId);
    const row = await projectsRepository.createRoom(projectId, input);
    return toRoomResponse(row);
  },

  async updateRoom(
    projectId: string,
    roomId: string,
    input: UpdateProjectRoomInput,
    caller: Caller,
  ): Promise<ProjectRoom> {
    await requireEditableProject(projectId, caller);
    if (input.roomTypeId) await validateRoomType(input.roomTypeId);
    const row = await projectsRepository.updateRoom(projectId, roomId, input);
    if (!row) throw AppError.notFound('Room not found');
    return toRoomResponse(row);
  },

  async reorderRooms(
    projectId: string,
    input: ReorderProjectRoomsInput,
    caller: Caller,
  ): Promise<ListProjectRoomsResponse> {
    await requireEditableProject(projectId, caller);
    const rooms = await projectsRepository.reorderRooms(projectId, input);
    if (!rooms) throw AppError.unprocessable('All reordered rooms must belong to the project');
    return { items: rooms.map(toRoomResponse) };
  },

  async deleteRoom(
    projectId: string,
    roomId: string,
    caller: Caller,
  ): Promise<DeleteProjectRoomResponse> {
    await requireEditableProject(projectId, caller);
    if (!(await projectsRepository.deleteRoom(projectId, roomId))) {
      throw AppError.notFound('Room not found');
    }
    return { id: roomId, deleted: true };
  },

  async linkImage(
    projectId: string,
    imageId: string,
    input: LinkProjectImageInput,
    caller: Caller,
  ): Promise<ProjectImageAttachment> {
    await requireEditableProject(projectId, caller);

    const image = await projectsRepository.findImage(projectId, imageId);
    if (!image) throw AppError.notFound('Image not found');

    if (input.roomId) {
      const room = await projectsRepository.findRoom(projectId, input.roomId);
      if (!room) throw AppError.unprocessable('Room must belong to the project');
    }

    const row = await projectsRepository.updateImageLink(projectId, imageId, input);
    if (!row) throw AppError.notFound('Image not found');
    return toImageAttachment(row);
  },

  async deleteImage(
    projectId: string,
    imageId: string,
    caller: Caller,
  ): Promise<DeleteProjectImageResponse> {
    await requireEditableProject(projectId, caller);
    const image = await projectsRepository.deleteImage(projectId, imageId);
    if (!image) throw AppError.notFound('Image not found');
    await deleteImageObjects(image);
    return toImageDeletion(image);
  },

  async getCompleteness(projectId: string, caller: Caller): Promise<ProjectCompletenessResponse> {
    const project = await requireReadableProject(projectId, caller);
    return buildCompleteness(project, await projectsRepository.getUploadImageCounts(projectId));
  },

  async submit(projectId: string, caller: Caller): Promise<ProjectDetailResponse> {
    await requireEditableProject(projectId, caller);
    const project = await projectsRepository.findById(projectId);
    if (!project) throw AppError.notFound('Project not found');
    const action = assertTransition(project.status, 'submitted', caller.userRole);
    // Narrows `project.status` for `expectedStatus` below. The matrix already rejects
    // every other source status, so this is a type guard rather than a second rule.
    if (
      project.status !== 'draft' &&
      project.status !== 'changes_requested' &&
      project.status !== 'rejected'
    ) {
      throw AppError.invalidTransition();
    }

    const metadataCompleteness = buildCompleteness(project, {
      imageCount: REQUIRED_PROJECT_PHOTO_COUNT,
      taggedImageCount: REQUIRED_PROJECT_PHOTO_COUNT,
    });
    const metadataMissing = metadataCompleteness.missing.filter(
      (key) => !PHOTO_COMPLETENESS_KEYS.has(key),
    );
    if (metadataMissing.length > 0) {
      throw AppError.unprocessable('Project is missing required upload information', {
        missing: metadataMissing,
      });
    }

    const submission = await projectsRepository.submitWithUploadCounts(projectId, {
      minImageCount: REQUIRED_PROJECT_PHOTO_COUNT,
      actorUserId: caller.userId,
      expectedStatus: project.status,
      action,
    });
    if (!submission.project) throw AppError.notFound('Project not found');

    const completeness = buildCompleteness(project, submission.counts);
    if (!completeness.complete) {
      throw AppError.unprocessable('Project is missing required upload information', {
        missing: completeness.missing,
      });
    }
    if (!submission.submitted) {
      throw AppError.invalidTransition();
    }

    return toDetailResponse(submission.submitted, await projectsRepository.listRooms(projectId));
  },

  async withdraw(projectId: string, caller: Caller): Promise<ProjectDetailResponse> {
    const ownership = await projectsRepository.findOwnership(projectId);
    if (!ownership) throw AppError.notFound('Project not found');
    await assertAccess(ownership, caller);

    const withdrawn = await transitionProject(
      {
        projectId,
        toStatus: 'draft',
        patch: {
          submittedAt: null,
          moderationNote: null,
          rejectionReasonCode: null,
        },
      },
      caller,
    );

    return toDetailResponse(withdrawn, await projectsRepository.listRooms(projectId));
  },

  async moderationHistory(projectId: string, caller: Caller): Promise<ModerationHistoryResponse> {
    const ownership = await projectsRepository.findOwnership(projectId);
    if (!ownership) throw AppError.notFound('Project not found');
    await assertAccess(ownership, caller);

    const events = await projectsRepository.listModerationHistory(projectId);
    return { items: events.map(toModerationHistoryItem) };
  },

  /** Public gallery: returns presigned URLs for all ready images of a published project. */
  async getGallery(projectId: string): Promise<
    Array<{
      id: string;
      url: string;
      width: number | null;
      height: number | null;
      roomName: string | null;
    }>
  > {
    // Verify project exists and is published
    const project = await projectsRepository.findById(projectId);
    if (!project || project.status !== 'published') {
      throw AppError.notFound('Project not found');
    }

    const images = await projectsRepository.listPublicGalleryImages(projectId);

    // Presign each image's best derivative for fullscreen display
    const gallery = await Promise.all(
      images.map(async (img) => {
        const key = pickGalleryDerivative(img.derivatives ?? []);
        if (!key) return null;
        const url = await presignDownload({ key }).catch(() => null);
        if (!url) return null;
        return {
          id: img.id,
          url,
          width: img.width,
          height: img.height,
          roomName: img.roomName,
        };
      }),
    );

    return gallery.filter((item): item is NonNullable<typeof item> => item !== null);
  },

  // ---------------------------------------------------------------------------
  // Public read endpoints (E-195)
  // ---------------------------------------------------------------------------

  /**
   * GET /api/projects/slug/{slug} — published project detail with designer summary,
   * rooms, and gallery images. Public, no auth.
   */
  async getPublicBySlug(slug: string): Promise<PublicProjectBySlugResponse> {
    const result = await projectsRepository.findPublicProjectBySlug(slug);
    if (!result) throw AppError.notFound('Project not found');

    const { project, designer } = result;

    // Load rooms, gallery images, cover image, and logo URL in parallel
    const [rooms, rawGalleryImages, coverImages, logoUrl] = await Promise.all([
      projectsRepository.listRooms(project.id),
      projectsRepository.listPublicGalleryImages(project.id),
      project.coverImageId
        ? projectsRepository.findCoverImages([project.coverImageId])
        : Promise.resolve(new Map()),
      designer.logoImageId
        ? presignDownload({ key: designer.logoImageId }).catch(() => null)
        : Promise.resolve(null),
    ]);

    // Presign gallery images (parallel)
    const galleryImages = (
      await Promise.all(
        rawGalleryImages.map(async (img) => {
          const key = pickGalleryDerivative(img.derivatives ?? []);
          if (!key) return null;
          const url = await presignDownload({ key }).catch(() => null);
          if (!url) return null;
          return { id: img.id, url, width: img.width, height: img.height, roomName: img.roomName };
        }),
      )
    ).filter((item): item is NonNullable<typeof item> => item !== null);

    // Resolve cover URL
    let resolvedCoverUrl: string | null = null;
    if (project.coverImageId) {
      const coverImg = coverImages.get(project.coverImageId);
      if (coverImg) {
        resolvedCoverUrl = await coverImageUrl({
          status: coverImg.status,
          derivatives: coverImg.derivatives,
        }).catch(() => null);
      }
    }

    return {
      id: project.id,
      title: project.title,
      slug: project.slug,
      description: project.description,
      status: project.status,
      propertyTypeSlug: project.propertyTypeSlug,
      propertySubtypeSlug: project.propertySubtypeSlug,
      scopeSlug: project.scopeSlug,
      bhkSlug: project.bhkSlug,
      sizeSqft: project.sizeSqft,
      citySlug: project.citySlug,
      localitySlug: project.localitySlug,
      buildingName: project.buildingName,
      budgetBandSlug: project.budgetBandSlug,
      completedMonth: project.completedMonth,
      durationMonths: project.durationMonths,
      publishedAt: project.publishedAt?.toISOString() ?? null,
      createdAt: project.createdAt.toISOString(),
      rooms: rooms.map(toRoomResponse),
      images: galleryImages,
      coverImageUrl: resolvedCoverUrl,
      designer: {
        id: designer.id,
        displayName: designer.displayName,
        slug: designer.orgSlug,
        avgRating: designer.avgRating,
        reviewCount: designer.reviewCount,
        entityType: designer.entityType as 'individual' | 'company',
        logoUrl,
      },
    };
  },

  /**
   * GET /api/profiles/{id}/projects — paginated published projects for a designer.
   *
   * `skipDesignerCheck` is set by the public-portfolio service, which has already
   * loaded and status-checked the profile — it saves a redundant round-trip.
   */
  async designerProjects(
    designerId: string,
    query: DesignerProjectsQuery,
    options?: { skipDesignerCheck?: boolean },
  ): Promise<DesignerProjectsResponse> {
    if (!options?.skipDesignerCheck) {
      // Verify the designer profile exists and is active
      const profile = await projectsRepository.findDesignerById(designerId);
      if (!profile || profile.status !== 'active') {
        throw AppError.notFound('Designer profile not found');
      }
    }

    const { page, limit } = query;
    const rows = await projectsRepository.listPublishedByDesigner(designerId, {
      limit: limit + 1,
      offset: (page - 1) * limit,
    });

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;

    const [labels, localityLabels] = await Promise.all([
      projectsRepository.findTaxonomyLabels(pageRows.flatMap(feedTaxonomyPairs)),
      projectsRepository.findLocalityLabels(pageRows.flatMap(feedLocalityPairs)),
    ]);

    const projects: DesignerProjectCard[] = await Promise.all(
      pageRows.map(async (row) => {
        const cover = await coverImageUrl({
          status: row.coverStatus,
          derivatives: row.coverDerivatives,
        }).catch(() => null);
        return toDesignerProjectCard(row, labels, localityLabels, cover);
      }),
    );

    return { projects, page, limit, hasMore };
  },

  /** Lowest published budget-band label for a designer, or null. */
  async designerStartingBudget(designerId: string): Promise<string | null> {
    return projectsRepository.findLowestBudgetBandLabel(designerId);
  },

  /**
   * GET /api/discovery/similar/{projectId} — similar published projects.
   * Rule-based: same city + bhk + budget band + scope on denormalized slug columns.
   */
  async similarProjects(projectId: string): Promise<SimilarProjectsResponse> {
    const project = await projectsRepository.findById(projectId);
    if (!project || project.status !== 'published') {
      throw AppError.notFound('Project not found');
    }

    const rows = await projectsRepository.findSimilarPublished(project, 8);

    const [labels, localityLabels] = await Promise.all([
      projectsRepository.findTaxonomyLabels(rows.flatMap(feedTaxonomyPairs)),
      projectsRepository.findLocalityLabels(rows.flatMap(feedLocalityPairs)),
    ]);

    const projects = await Promise.all(
      rows.map(async (row) => {
        const cover = await coverImageUrl({
          status: row.coverStatus,
          derivatives: row.coverDerivatives,
        }).catch(() => null);
        return toFeedProject(row, labels, localityLabels, cover);
      }),
    );

    return { projects };
  },
};
