import { ilike, inArray } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db, schema, eq, and, or, desc, asc, sql, isNotNull } from '@repo/db';
import type {
  CreateProjectInput,
  CreateProjectRoomInput,
  LinkProjectImageInput,
  ProjectListSort,
  ProjectStatus,
  ReorderProjectRoomsInput,
  UpdateProjectInput,
  UpdateProjectRoomInput,
} from '@repo/contracts';

/**
 * Data-access for projects. This is the ONLY layer that imports Drizzle.
 * It exposes a framework-free record type and typed methods over the schema.
 */
export type ProjectRecord = typeof schema.project.$inferSelect;
export type ProjectRoomRecord = typeof schema.projectRoom.$inferSelect;
type ProjectImageRecord = typeof schema.projectImage.$inferSelect;
export type TaxonomyTermRecord = Pick<
  typeof schema.taxonomy.$inferSelect,
  'id' | 'kind' | 'slug' | 'label' | 'metadata'
>;
export type ProjectImageAttachmentRecord = Pick<
  ProjectImageRecord,
  'id' | 'projectId' | 'roomId' | 'status' | 'sortOrder'
>;
export type ProjectImageDeletionRecord = Pick<
  ProjectImageRecord,
  'id' | 'projectId' | 'originalKey' | 'derivatives'
>;

export type ProjectOwnership = {
  projectId: string;
  designerId: string;
  status: ProjectStatus;
  ownerUserId: string | null;
};

export type UploadImageCounts = {
  imageCount: number;
  taggedImageCount: number;
};

export type SubmitWithUploadCountsResult = {
  project: ProjectRecord | null;
  counts: UploadImageCounts;
  submitted: ProjectRecord | null;
};

const freshProcessingImageFilter = sql`
  (
    ${schema.projectImage.status} = 'ready'
    or (
      ${schema.projectImage.status} = 'processing'
      and ${schema.projectImage.updatedAt} >= now() - interval '30 minutes'
    )
  )
`;

const emptyUploadImageCounts: UploadImageCounts = {
  imageCount: 0,
  taggedImageCount: 0,
};

export type ListProjectsParams = {
  userId: string;
  activeOrgId?: string | null;
  statuses?: ProjectStatus[];
  q?: string;
  limit: number;
  offset: number;
  sort: ProjectListSort;
};

export type ProjectListItemRecord = Pick<
  ProjectRecord,
  | 'id'
  | 'slug'
  | 'title'
  | 'propertyTypeSlug'
  | 'propertySubtypeSlug'
  | 'citySlug'
  | 'localitySlug'
  | 'status'
  | 'coverImageId'
  | 'createdAt'
  | 'updatedAt'
>;
export type ProjectCoverImageRecord = Pick<ProjectImageRecord, 'id' | 'derivatives' | 'status'>;
export type ProjectStatusCountRecord = {
  status: ProjectStatus;
  count: number;
};

export type TaxonomyKind = (typeof schema.taxonomyKindEnum.enumValues)[number];

/** One row of the public landing feed — project + its designer + cover image, flat. */
export type ProjectFeedItemRecord = {
  id: string;
  slug: string;
  title: string;
  citySlug: string | null;
  localitySlug: string | null;
  budgetBandSlug: string | null;
  scopeSlug: string | null;
  bhkSlug: string | null;
  propertySubtypeSlug: string | null;
  studio: string;
  rating: string; // designer_profile.avg_rating is numeric → string over the wire
  reviewCount: number;
  coverStatus: ProjectImageRecord['status'] | null;
  coverDerivatives: ProjectImageRecord['derivatives'] | null;
  coverWidth: number | null;
  coverHeight: number | null;
};

export type DuplicateProjectParams = {
  source: ProjectRecord;
  title: string;
  slug: string;
};

function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'project'
  );
}

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

export const projectsRepository = {
  async list(params: ListProjectsParams): Promise<{ items: ProjectListItemRecord[]; total: number }> {
    const searchPattern = params.q ? `%${escapeLikePattern(params.q)}%` : null;
    const filters = [
      eq(schema.member.userId, params.userId),
      params.activeOrgId ? eq(schema.designerProfile.orgId, params.activeOrgId) : undefined,
      params.statuses?.length ? inArray(schema.project.status, params.statuses) : undefined,
      searchPattern
        ? or(
            ilike(schema.project.title, searchPattern),
            ilike(schema.project.localitySlug, searchPattern),
          )
        : undefined,
    ].filter((f) => f !== undefined);

    const where = filters.length ? and(...filters) : undefined;
    const orderBy = (() => {
      switch (params.sort) {
        case 'updatedAt':
          return asc(schema.project.updatedAt);
        case '-createdAt':
          return desc(schema.project.createdAt);
        case 'createdAt':
          return asc(schema.project.createdAt);
        case 'title':
          return asc(schema.project.title);
        case '-title':
          return desc(schema.project.title);
        case '-updatedAt':
        default:
          return desc(schema.project.updatedAt);
      }
    })();

    const [items, [count]] = await Promise.all([
      db
        .select({
          id: schema.project.id,
          slug: schema.project.slug,
          title: schema.project.title,
          propertyTypeSlug: schema.project.propertyTypeSlug,
          propertySubtypeSlug: schema.project.propertySubtypeSlug,
          citySlug: schema.project.citySlug,
          localitySlug: schema.project.localitySlug,
          status: schema.project.status,
          coverImageId: schema.project.coverImageId,
          createdAt: schema.project.createdAt,
          updatedAt: schema.project.updatedAt,
        })
        .from(schema.project)
        .innerJoin(schema.designerProfile, eq(schema.project.designerId, schema.designerProfile.id))
        .innerJoin(schema.member, eq(schema.designerProfile.orgId, schema.member.organizationId))
        .where(where)
        .orderBy(orderBy)
        .limit(params.limit)
        .offset(params.offset),
      db
        .select({ value: sql<number>`count(*)::int` })
        .from(schema.project)
        .innerJoin(schema.designerProfile, eq(schema.project.designerId, schema.designerProfile.id))
        .innerJoin(schema.member, eq(schema.designerProfile.orgId, schema.member.organizationId))
        .where(where),
    ]);

    return { items, total: count?.value ?? 0 };
  },

  async countByStatus(params: {
    userId: string;
    activeOrgId?: string | null;
  }): Promise<ProjectStatusCountRecord[]> {
    const filters = [
      eq(schema.member.userId, params.userId),
      params.activeOrgId ? eq(schema.designerProfile.orgId, params.activeOrgId) : undefined,
    ].filter((filter) => filter !== undefined);

    return db
      .select({
        status: schema.project.status,
        count: sql<number>`count(*)::int`,
      })
      .from(schema.project)
      .innerJoin(schema.designerProfile, eq(schema.project.designerId, schema.designerProfile.id))
      .innerJoin(schema.member, eq(schema.designerProfile.orgId, schema.member.organizationId))
      .where(and(...filters))
      .groupBy(schema.project.status);
  },

  async findCoverImages(imageIds: string[]): Promise<Map<string, ProjectCoverImageRecord>> {
    const uniqueIds = [...new Set(imageIds)];
    if (uniqueIds.length === 0) return new Map();

    const rows = await db
      .select({
        id: schema.projectImage.id,
        status: schema.projectImage.status,
        derivatives: schema.projectImage.derivatives,
      })
      .from(schema.projectImage)
      .where(inArray(schema.projectImage.id, uniqueIds));

    return new Map(rows.map((row) => [row.id, row]));
  },

  /**
   * Public landing feed: published projects only, newest first, joined to their
   * designer (studio name + rating) and cover image. No auth/org scoping.
   */
  async listPublishedFeed(params: { limit: number; offset: number }): Promise<ProjectFeedItemRecord[]> {
    const cover = alias(schema.projectImage, 'cover');
    return db
      .select({
        id: schema.project.id,
        slug: schema.project.slug,
        title: schema.project.title,
        citySlug: schema.project.citySlug,
        localitySlug: schema.project.localitySlug,
        budgetBandSlug: schema.project.budgetBandSlug,
        scopeSlug: schema.project.scopeSlug,
        bhkSlug: schema.project.bhkSlug,
        propertySubtypeSlug: schema.project.propertySubtypeSlug,
        studio: schema.designerProfile.displayName,
        rating: schema.designerProfile.avgRating,
        reviewCount: schema.designerProfile.reviewCount,
        coverStatus: cover.status,
        coverDerivatives: cover.derivatives,
        coverWidth: cover.width,
        coverHeight: cover.height,
      })
      .from(schema.project)
      .innerJoin(schema.designerProfile, eq(schema.project.designerId, schema.designerProfile.id))
      .leftJoin(cover, eq(schema.project.coverImageId, cover.id))
      // Only active designers: suspended studios 404 on their public profile, so their
      // projects must not surface here either. `id` is the stable tiebreaker for paging.
      .where(and(eq(schema.project.status, 'published'), eq(schema.designerProfile.status, 'active')))
      .orderBy(
        sql`${schema.project.publishedAt} desc nulls last`,
        desc(schema.project.createdAt),
        desc(schema.project.id),
      )
      .limit(params.limit)
      .offset(params.offset);
  },

  /**
   * Batch-resolve display labels for non-hierarchical taxonomy pairs (city, budget_band,
   * bhk, scope, property_subtype — unique by `(kind, slug)`). Filters `is_active` so the
   * public feed hides retired terms, matching the taxonomy module's read policy. Localities
   * are NOT resolvable here (slug is only unique within a parent city) — use
   * `findLocalityLabels`. Keyed `${kind}:${slug}`; unresolved pairs are simply absent.
   */
  async findTaxonomyLabels(pairs: { kind: TaxonomyKind; slug: string }[]): Promise<Map<string, string>> {
    const unique = [...new Map(pairs.map((p) => [`${p.kind}:${p.slug}`, p])).values()];
    if (unique.length === 0) return new Map();
    const rows = await db
      .select({
        kind: schema.taxonomy.kind,
        slug: schema.taxonomy.slug,
        label: schema.taxonomy.label,
      })
      .from(schema.taxonomy)
      .where(
        and(
          eq(schema.taxonomy.isActive, true),
          or(...unique.map((p) => and(eq(schema.taxonomy.kind, p.kind), eq(schema.taxonomy.slug, p.slug)))),
        ),
      );
    return new Map(rows.map((row) => [`${row.kind}:${row.slug}`, row.label]));
  },

  /**
   * Resolve locality labels scoped to their parent city. Locality slugs are only unique
   * within a city (`/mumbai/andheri` vs `/pune/andheri`), so resolving by slug alone would
   * pick an arbitrary city's label. Keyed `${citySlug}:${localitySlug}`.
   */
  async findLocalityLabels(
    pairs: { citySlug: string; localitySlug: string }[],
  ): Promise<Map<string, string>> {
    const unique = [...new Map(pairs.map((p) => [`${p.citySlug}:${p.localitySlug}`, p])).values()];
    if (unique.length === 0) return new Map();
    const city = alias(schema.taxonomy, 'city');
    const rows = await db
      .select({
        citySlug: city.slug,
        localitySlug: schema.taxonomy.slug,
        label: schema.taxonomy.label,
      })
      .from(schema.taxonomy)
      .innerJoin(city, eq(schema.taxonomy.parentId, city.id))
      .where(
        and(
          eq(schema.taxonomy.kind, 'locality'),
          eq(schema.taxonomy.isActive, true),
          eq(city.kind, 'city'),
          eq(city.isActive, true),
          or(
            ...unique.map((p) =>
              and(eq(schema.taxonomy.slug, p.localitySlug), eq(city.slug, p.citySlug)),
            ),
          ),
        ),
      );
    return new Map(rows.map((row) => [`${row.citySlug}:${row.localitySlug}`, row.label]));
  },

  async findById(id: string): Promise<ProjectRecord | null> {
    const [row] = await db.select().from(schema.project).where(eq(schema.project.id, id)).limit(1);
    return row ?? null;
  },

  async findByIdWithRooms(
    id: string,
  ): Promise<{ project: ProjectRecord; rooms: ProjectRoomRecord[] } | null> {
    const project = await this.findById(id);
    if (!project) return null;
    const rooms = await this.listRooms(id);
    return { project, rooms };
  },

  async findBySlug(slug: string): Promise<ProjectRecord | null> {
    const [row] = await db
      .select()
      .from(schema.project)
      .where(eq(schema.project.slug, slug))
      .limit(1);
    return row ?? null;
  },

  async createDraft(
    input: CreateProjectInput & { title: string },
    designerId: string,
    slug: string,
  ): Promise<ProjectRecord> {
    const [row] = await db
      .insert(schema.project)
      .values({
        designerId,
        title: input.title,
        slug,
        description: input.description ?? null,
        propertyTypeSlug: input.propertyTypeSlug ?? null,
        propertySubtypeSlug: input.propertySubtypeSlug ?? null,
        scopeSlug: input.scopeSlug ?? null,
        bhkSlug: input.bhkSlug ?? null,
        sizeSqft: input.sizeSqft ?? null,
        citySlug: input.citySlug ?? null,
        localitySlug: input.localitySlug ?? null,
        buildingName: input.buildingName ?? null,
        budgetBandSlug: input.budgetBandSlug ?? null,
        completedMonth: input.completedMonth ?? null,
        durationMonths: input.durationMonths ?? null,
        metadata: input.metadata ?? {},
      })
      .returning();
    if (!row) throw new Error('insert returned no row');
    return row;
  },

  async duplicateProject(params: DuplicateProjectParams): Promise<{
    project: ProjectRecord;
    rooms: ProjectRoomRecord[];
  }> {
    return db.transaction(async (tx) => {
      const now = new Date();
      const [project] = await tx
        .insert(schema.project)
        .values({
          designerId: params.source.designerId,
          title: params.title,
          slug: params.slug,
          description: params.source.description,
          status: 'draft',
          propertyTypeSlug: params.source.propertyTypeSlug,
          propertySubtypeSlug: params.source.propertySubtypeSlug,
          scopeSlug: params.source.scopeSlug,
          bhkSlug: params.source.bhkSlug,
          sizeSqft: params.source.sizeSqft,
          citySlug: params.source.citySlug,
          localitySlug: params.source.localitySlug,
          buildingName: params.source.buildingName,
          budgetBandSlug: params.source.budgetBandSlug,
          completedMonth: params.source.completedMonth,
          durationMonths: params.source.durationMonths,
          metadata: params.source.metadata ?? {},
          publishedAt: null,
          submittedAt: null,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      if (!project) throw new Error('insert returned no row');

      const sourceRooms = await tx
        .select()
        .from(schema.projectRoom)
        .where(eq(schema.projectRoom.projectId, params.source.id))
        .orderBy(asc(schema.projectRoom.sortOrder), asc(schema.projectRoom.createdAt));

      const roomIdBySourceId = new Map<string, string>();
      const rooms = sourceRooms.length
        ? await tx
            .insert(schema.projectRoom)
            .values(
              sourceRooms.map((room) => ({
                projectId: project.id,
                roomTypeId: room.roomTypeId,
                name: room.name,
                description: room.description,
                sortOrder: room.sortOrder,
                metadata: room.metadata ?? {},
                createdAt: now,
                updatedAt: now,
              })),
            )
            .returning()
        : [];

      sourceRooms.forEach((room, index) => {
        const copiedRoom = rooms[index];
        if (copiedRoom) roomIdBySourceId.set(room.id, copiedRoom.id);
      });

      const sourceImages = await tx
        .select()
        .from(schema.projectImage)
        .where(eq(schema.projectImage.projectId, params.source.id))
        .orderBy(asc(schema.projectImage.sortOrder), asc(schema.projectImage.createdAt));

      let copiedCoverImageId: string | null = null;
      for (const image of sourceImages) {
        const [copiedImage] = await tx
          .insert(schema.projectImage)
          .values({
            projectId: project.id,
            roomId: image.roomId ? roomIdBySourceId.get(image.roomId) ?? null : null,
            originalKey: image.originalKey,
            contentType: image.contentType,
            derivatives: image.derivatives,
            themeSlugs: image.themeSlugs,
            materialSlugs: image.materialSlugs,
            finishSlugs: image.finishSlugs,
            tagSlugs: image.tagSlugs,
            width: image.width,
            height: image.height,
            phash: image.phash,
            status: image.status,
            sortOrder: image.sortOrder,
            createdAt: now,
            updatedAt: now,
          })
          .returning({ id: schema.projectImage.id });
        if (image.id === params.source.coverImageId) {
          copiedCoverImageId = copiedImage?.id ?? null;
        }
      }

      if (copiedCoverImageId) {
        const [updatedProject] = await tx
          .update(schema.project)
          .set({ coverImageId: copiedCoverImageId, updatedAt: now })
          .where(eq(schema.project.id, project.id))
          .returning();
        return { project: updatedProject ?? project, rooms };
      }

      return { project, rooms };
    });
  },

  async updateDraft(id: string, input: UpdateProjectInput): Promise<ProjectRecord | null> {
    const patch: Partial<typeof schema.project.$inferInsert> = {};
    if (input.title !== undefined) patch.title = input.title;
    if (input.description !== undefined) patch.description = input.description;
    if (input.propertyTypeSlug !== undefined) patch.propertyTypeSlug = input.propertyTypeSlug;
    if (input.propertySubtypeSlug !== undefined) patch.propertySubtypeSlug = input.propertySubtypeSlug;
    if (input.scopeSlug !== undefined) patch.scopeSlug = input.scopeSlug;
    if (input.bhkSlug !== undefined) patch.bhkSlug = input.bhkSlug;
    if (input.sizeSqft !== undefined) patch.sizeSqft = input.sizeSqft;
    if (input.citySlug !== undefined) patch.citySlug = input.citySlug;
    if (input.localitySlug !== undefined) patch.localitySlug = input.localitySlug;
    if (input.buildingName !== undefined) patch.buildingName = input.buildingName;
    if (input.budgetBandSlug !== undefined) patch.budgetBandSlug = input.budgetBandSlug;
    if (input.completedMonth !== undefined) patch.completedMonth = input.completedMonth;
    if (input.durationMonths !== undefined) patch.durationMonths = input.durationMonths;
    if (input.coverImageId !== undefined) patch.coverImageId = input.coverImageId;
    if (input.metadata !== undefined) patch.metadata = input.metadata;

    const [row] = await db
      .update(schema.project)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(schema.project.id, id))
      .returning();
    return row ?? null;
  },

  async submit(id: string): Promise<ProjectRecord> {
    const now = new Date();
    const [row] = await db
      .update(schema.project)
      .set({ status: 'submitted', submittedAt: now, updatedAt: now })
      .where(eq(schema.project.id, id))
      .returning();
    if (!row) throw new Error('update returned no row');
    return row;
  },

  async submitWithUploadCounts(
    id: string,
    requirements: { minImageCount: number },
  ): Promise<SubmitWithUploadCountsResult> {
    return db.transaction(async (tx) => {
      const [project] = await tx
        .select()
        .from(schema.project)
        .where(eq(schema.project.id, id))
        .for('update')
        .limit(1);

      if (!project) {
        return { project: null, counts: emptyUploadImageCounts, submitted: null };
      }

      const [row] = await tx
        .select({
          imageCount: sql<number>`count(*)::int`,
          taggedImageCount: sql<number>`
            count(*) filter (
              where jsonb_array_length(${schema.projectImage.themeSlugs}) > 0
                and jsonb_array_length(${schema.projectImage.finishSlugs}) > 0
            )::int
          `,
        })
        .from(schema.projectImage)
        .where(
          and(
            eq(schema.projectImage.projectId, id),
            freshProcessingImageFilter,
            isNotNull(schema.projectImage.roomId),
          ),
        );

      const counts = {
        imageCount: row?.imageCount ?? 0,
        taggedImageCount: row?.taggedImageCount ?? 0,
      };
      const hasRequiredImages =
        counts.imageCount >= requirements.minImageCount &&
        counts.taggedImageCount === counts.imageCount;

      if (!hasRequiredImages) {
        return { project, counts, submitted: null };
      }

      const now = new Date();
      const [submitted] = await tx
        .update(schema.project)
        .set({ status: 'submitted', submittedAt: now, updatedAt: now })
        .where(and(eq(schema.project.id, id), inArray(schema.project.status, ['draft', 'changes_requested'])))
        .returning();

      return { project, counts, submitted: submitted ?? null };
    });
  },

  async getUploadImageCounts(projectId: string): Promise<UploadImageCounts> {
    const [row] = await db
      .select({
        imageCount: sql<number>`count(*)::int`,
        taggedImageCount: sql<number>`
          count(*) filter (
            where jsonb_array_length(${schema.projectImage.themeSlugs}) > 0
              and jsonb_array_length(${schema.projectImage.finishSlugs}) > 0
          )::int
        `,
      })
      .from(schema.projectImage)
      .where(
        and(
          eq(schema.projectImage.projectId, projectId),
          freshProcessingImageFilter,
          isNotNull(schema.projectImage.roomId),
        ),
      );
    return {
      imageCount: row?.imageCount ?? 0,
      taggedImageCount: row?.taggedImageCount ?? 0,
    };
  },

  async deleteProject(id: string): Promise<boolean> {
    const rows = await db.delete(schema.project).where(eq(schema.project.id, id)).returning({
      id: schema.project.id,
    });
    return rows.length > 0;
  },

  async findDesignerByUserId(userId: string): Promise<{ id: string; orgId: string } | null> {
    const [row] = await db
      .select({ id: schema.designerProfile.id, orgId: schema.designerProfile.orgId })
      .from(schema.designerProfile)
      .where(eq(schema.designerProfile.userId, userId))
      .limit(1);
    return row ?? null;
  },

  async findOwnership(projectId: string): Promise<ProjectOwnership | null> {
    const [row] = await db
      .select({
        projectId: schema.project.id,
        designerId: schema.project.designerId,
        status: schema.project.status,
        ownerUserId: schema.designerProfile.userId,
      })
      .from(schema.project)
      .innerJoin(schema.designerProfile, eq(schema.project.designerId, schema.designerProfile.id))
      .where(eq(schema.project.id, projectId))
      .limit(1);
    return row ?? null;
  },

  async taxonomyExists(
    kind: (typeof schema.taxonomyKindEnum.enumValues)[number],
    value: { id: string } | { slug: string },
  ): Promise<boolean> {
    const where =
      'id' in value
        ? and(eq(schema.taxonomy.kind, kind), eq(schema.taxonomy.id, value.id))
        : and(eq(schema.taxonomy.kind, kind), eq(schema.taxonomy.slug, value.slug));
    const [row] = await db.select({ id: schema.taxonomy.id }).from(schema.taxonomy).where(where).limit(1);
    return !!row;
  },

  async findTaxonomyTermBySlug(
    kind: (typeof schema.taxonomyKindEnum.enumValues)[number],
    slug: string,
  ): Promise<TaxonomyTermRecord | null> {
    const [row] = await db
      .select({
        id: schema.taxonomy.id,
        kind: schema.taxonomy.kind,
        slug: schema.taxonomy.slug,
        label: schema.taxonomy.label,
        metadata: schema.taxonomy.metadata,
      })
      .from(schema.taxonomy)
      .where(and(eq(schema.taxonomy.kind, kind), eq(schema.taxonomy.slug, slug)))
      .limit(1);
    return row ?? null;
  },

  async propertySubtypeExists(input: {
    subtypeSlug: string;
    propertyTypeSlug?: string | null;
  }): Promise<boolean> {
    const filters = [
      eq(schema.taxonomy.kind, 'property_subtype'),
      eq(schema.taxonomy.slug, input.subtypeSlug),
      input.propertyTypeSlug
        ? sql`${schema.taxonomy.metadata}->>'propertyTypeSlug' = ${input.propertyTypeSlug}`
        : undefined,
    ].filter((f) => f !== undefined);

    const [row] = await db
      .select({ id: schema.taxonomy.id })
      .from(schema.taxonomy)
      .where(and(...filters))
      .limit(1);
    return !!row;
  },

  async localityExists(input: { citySlug: string; localitySlug: string }): Promise<boolean> {
    const [city] = await db
      .select({ id: schema.taxonomy.id })
      .from(schema.taxonomy)
      .where(and(eq(schema.taxonomy.kind, 'city'), eq(schema.taxonomy.slug, input.citySlug)))
      .limit(1);
    if (!city) return false;

    const [locality] = await db
      .select({ id: schema.taxonomy.id })
      .from(schema.taxonomy)
      .where(
        and(
          eq(schema.taxonomy.kind, 'locality'),
          eq(schema.taxonomy.slug, input.localitySlug),
          eq(schema.taxonomy.parentId, city.id),
        ),
      )
      .limit(1);
    return !!locality;
  },

  async listRooms(projectId: string): Promise<ProjectRoomRecord[]> {
    return db
      .select()
      .from(schema.projectRoom)
      .where(eq(schema.projectRoom.projectId, projectId))
      .orderBy(asc(schema.projectRoom.sortOrder), asc(schema.projectRoom.createdAt));
  },

  async findRoom(projectId: string, roomId: string): Promise<ProjectRoomRecord | null> {
    const [row] = await db
      .select()
      .from(schema.projectRoom)
      .where(and(eq(schema.projectRoom.projectId, projectId), eq(schema.projectRoom.id, roomId)))
      .limit(1);
    return row ?? null;
  },

  async createRoom(projectId: string, input: CreateProjectRoomInput): Promise<ProjectRoomRecord> {
    const [row] = await db
      .insert(schema.projectRoom)
      .values({
        projectId,
        roomTypeId: input.roomTypeId,
        name: input.name,
        description: input.description ?? null,
        sortOrder: input.sortOrder ?? 0,
        metadata: input.metadata ?? {},
      })
      .returning();
    if (!row) throw new Error('insert returned no row');
    return row;
  },

  async findRoomTypesBySlugs(slugs: string[]): Promise<TaxonomyTermRecord[]> {
    if (slugs.length === 0) return [];
    return db
      .select({
        id: schema.taxonomy.id,
        kind: schema.taxonomy.kind,
        slug: schema.taxonomy.slug,
        label: schema.taxonomy.label,
        metadata: schema.taxonomy.metadata,
      })
      .from(schema.taxonomy)
      .where(and(eq(schema.taxonomy.kind, 'room'), inArray(schema.taxonomy.slug, slugs)));
  },

  async createRooms(
    projectId: string,
    inputs: CreateProjectRoomInput[],
  ): Promise<ProjectRoomRecord[]> {
    if (inputs.length === 0) return [];
    const now = new Date();
    return db.transaction(async (tx) =>
      tx
        .insert(schema.projectRoom)
        .values(
          inputs.map((input) => ({
            projectId,
            roomTypeId: input.roomTypeId,
            name: input.name,
            description: input.description ?? null,
            sortOrder: input.sortOrder ?? 0,
            metadata: input.metadata ?? {},
            createdAt: now,
            updatedAt: now,
          })),
        )
        .returning(),
    );
  },

  async updateRoom(
    projectId: string,
    roomId: string,
    input: UpdateProjectRoomInput,
  ): Promise<ProjectRoomRecord | null> {
    const patch: Partial<typeof schema.projectRoom.$inferInsert> = {};
    if (input.roomTypeId !== undefined) patch.roomTypeId = input.roomTypeId;
    if (input.name !== undefined) patch.name = input.name;
    if (input.description !== undefined) patch.description = input.description;
    if (input.sortOrder !== undefined) patch.sortOrder = input.sortOrder;
    if (input.metadata !== undefined) patch.metadata = input.metadata;

    const [row] = await db
      .update(schema.projectRoom)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(schema.projectRoom.projectId, projectId), eq(schema.projectRoom.id, roomId)))
      .returning();
    return row ?? null;
  },

  async reorderRooms(
    projectId: string,
    input: ReorderProjectRoomsInput,
  ): Promise<ProjectRoomRecord[] | null> {
    const ids = input.rooms.map((room) => room.id);
    const existing = await db
      .select({ id: schema.projectRoom.id })
      .from(schema.projectRoom)
      .where(and(eq(schema.projectRoom.projectId, projectId), inArray(schema.projectRoom.id, ids)));
    if (existing.length !== ids.length) return null;

    await db.transaction(async (tx) => {
      for (const room of input.rooms) {
        await tx
          .update(schema.projectRoom)
          .set({ sortOrder: room.sortOrder, updatedAt: new Date() })
          .where(and(eq(schema.projectRoom.projectId, projectId), eq(schema.projectRoom.id, room.id)));
      }
    });

    return this.listRooms(projectId);
  },

  async deleteRoom(projectId: string, roomId: string): Promise<boolean> {
    const rows = await db
      .delete(schema.projectRoom)
      .where(and(eq(schema.projectRoom.projectId, projectId), eq(schema.projectRoom.id, roomId)))
      .returning({ id: schema.projectRoom.id });
    return rows.length > 0;
  },

  async findImage(projectId: string, imageId: string): Promise<ProjectImageAttachmentRecord | null> {
    const [row] = await db
      .select({
        id: schema.projectImage.id,
        projectId: schema.projectImage.projectId,
        roomId: schema.projectImage.roomId,
        status: schema.projectImage.status,
        sortOrder: schema.projectImage.sortOrder,
      })
      .from(schema.projectImage)
      .where(and(eq(schema.projectImage.projectId, projectId), eq(schema.projectImage.id, imageId)))
      .limit(1);
    return row ?? null;
  },

  async updateImageLink(
    projectId: string,
    imageId: string,
    input: LinkProjectImageInput,
  ): Promise<ProjectImageAttachmentRecord | null> {
    const patch: Partial<typeof schema.projectImage.$inferInsert> = {};
    if (input.roomId !== undefined) patch.roomId = input.roomId;
    if (input.sortOrder !== undefined) patch.sortOrder = input.sortOrder;

    const [row] = await db
      .update(schema.projectImage)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(schema.projectImage.projectId, projectId), eq(schema.projectImage.id, imageId)))
      .returning({
        id: schema.projectImage.id,
        projectId: schema.projectImage.projectId,
        roomId: schema.projectImage.roomId,
        status: schema.projectImage.status,
        sortOrder: schema.projectImage.sortOrder,
      });
    return row ?? null;
  },

  async deleteImage(projectId: string, imageId: string): Promise<ProjectImageDeletionRecord | null> {
    return db.transaction(async (tx) => {
      const [image] = await tx
        .select({
          id: schema.projectImage.id,
          projectId: schema.projectImage.projectId,
          originalKey: schema.projectImage.originalKey,
          derivatives: schema.projectImage.derivatives,
        })
        .from(schema.projectImage)
        .where(and(eq(schema.projectImage.projectId, projectId), eq(schema.projectImage.id, imageId)))
        .limit(1);

      if (!image) return null;

      await tx
        .update(schema.project)
        .set({ coverImageId: null, updatedAt: new Date() })
        .where(and(eq(schema.project.id, projectId), eq(schema.project.coverImageId, imageId)));

      await tx
        .delete(schema.projectImage)
        .where(and(eq(schema.projectImage.projectId, projectId), eq(schema.projectImage.id, imageId)));

      return image;
    });
  },

  /** Public gallery: all ready images for a published project, ordered by sortOrder. */
  async listPublicGalleryImages(projectId: string): Promise<Array<{
    id: string;
    derivatives: typeof schema.projectImage.$inferSelect.derivatives;
    width: number | null;
    height: number | null;
    sortOrder: number;
    roomName: string | null;
  }>> {
    return db
      .select({
        id: schema.projectImage.id,
        derivatives: schema.projectImage.derivatives,
        width: schema.projectImage.width,
        height: schema.projectImage.height,
        sortOrder: schema.projectImage.sortOrder,
        roomName: schema.projectRoom.name,
      })
      .from(schema.projectImage)
      .leftJoin(schema.projectRoom, eq(schema.projectImage.roomId, schema.projectRoom.id))
      .where(
        and(
          eq(schema.projectImage.projectId, projectId),
          eq(schema.projectImage.status, 'ready'),
        ),
      )
      .orderBy(asc(schema.projectImage.sortOrder), asc(schema.projectImage.createdAt));
  },

  async findReferencedImageObjectKeys(keys: string[]): Promise<string[]> {
    if (keys.length === 0) return [];

    const keySet = new Set(keys);
    const derivativeKeyFilters = keys.map((key) =>
      sql<boolean>`${schema.projectImage.derivatives} @> ${JSON.stringify([{ key }])}::jsonb`,
    );
    const rows = await db
      .select({
        originalKey: schema.projectImage.originalKey,
        derivatives: schema.projectImage.derivatives,
      })
      .from(schema.projectImage)
      .where(or(inArray(schema.projectImage.originalKey, keys), ...derivativeKeyFilters));

    const referenced = new Set<string>();
    for (const row of rows) {
      if (keySet.has(row.originalKey)) referenced.add(row.originalKey);
      for (const derivative of row.derivatives) {
        if (keySet.has(derivative.key)) referenced.add(derivative.key);
      }
    }

    return [...referenced];
  },

  slugify,

  // ---------------------------------------------------------------------------
  // Public read endpoints (E-195)
  // ---------------------------------------------------------------------------

  /**
   * Published project by slug with joined designer + org for slug resolution.
   * Returns raw data — service handles URL signing and response composition.
   */
  async findPublicProjectBySlug(slug: string): Promise<{
    project: ProjectRecord;
    designer: {
      id: string;
      displayName: string;
      orgSlug: string | null;
      avgRating: string;
      reviewCount: number;
      entityType: string;
      logoImageId: string | null;
    };
  } | null> {
    const [row] = await db
      .select({
        project: schema.project,
        designerId: schema.designerProfile.id,
        designerDisplayName: schema.designerProfile.displayName,
        designerOrgSlug: schema.organization.slug,
        designerAvgRating: schema.designerProfile.avgRating,
        designerReviewCount: schema.designerProfile.reviewCount,
        designerEntityType: schema.designerProfile.entityType,
        designerLogoImageId: schema.designerProfile.logoImageId,
      })
      .from(schema.project)
      .innerJoin(schema.designerProfile, eq(schema.project.designerId, schema.designerProfile.id))
      .innerJoin(schema.organization, eq(schema.designerProfile.orgId, schema.organization.id))
      .where(
        and(
          eq(schema.project.slug, slug),
          eq(schema.project.status, 'published'),
          eq(schema.designerProfile.status, 'active'),
        ),
      )
      .limit(1);

    if (!row) return null;

    return {
      project: row.project,
      designer: {
        id: row.designerId,
        displayName: row.designerDisplayName,
        orgSlug: row.designerOrgSlug,
        avgRating: row.designerAvgRating,
        reviewCount: row.designerReviewCount,
        entityType: row.designerEntityType,
        logoImageId: row.designerLogoImageId,
      },
    };
  },

  /**
   * Published projects by designer ID — same feed projection as listPublishedFeed
   * but filtered to a single designer. Used for the public profile page grid.
   */
  async listPublishedByDesigner(
    designerId: string,
    params: { limit: number; offset: number },
  ): Promise<ProjectFeedItemRecord[]> {
    const cover = alias(schema.projectImage, 'cover');
    return db
      .select({
        id: schema.project.id,
        slug: schema.project.slug,
        title: schema.project.title,
        citySlug: schema.project.citySlug,
        localitySlug: schema.project.localitySlug,
        budgetBandSlug: schema.project.budgetBandSlug,
        scopeSlug: schema.project.scopeSlug,
        bhkSlug: schema.project.bhkSlug,
        propertySubtypeSlug: schema.project.propertySubtypeSlug,
        studio: schema.designerProfile.displayName,
        rating: schema.designerProfile.avgRating,
        reviewCount: schema.designerProfile.reviewCount,
        coverStatus: cover.status,
        coverDerivatives: cover.derivatives,
        coverWidth: cover.width,
        coverHeight: cover.height,
      })
      .from(schema.project)
      .innerJoin(schema.designerProfile, eq(schema.project.designerId, schema.designerProfile.id))
      .leftJoin(cover, eq(schema.project.coverImageId, cover.id))
      .where(
        and(
          eq(schema.project.designerId, designerId),
          eq(schema.project.status, 'published'),
          eq(schema.designerProfile.status, 'active'),
        ),
      )
      .orderBy(
        sql`${schema.project.publishedAt} desc nulls last`,
        desc(schema.project.createdAt),
        desc(schema.project.id),
      )
      .limit(params.limit)
      .offset(params.offset);
  },

  /**
   * Similar published projects: same city + scope + budget band + room type overlap.
   * Rule-based matching exactly as specified — no relaxation for null values.
   */
  async findSimilarPublished(
    sourceProject: Pick<ProjectRecord, 'id' | 'citySlug' | 'scopeSlug' | 'budgetBandSlug' | 'bhkSlug'>,
    limit: number,
  ): Promise<ProjectFeedItemRecord[]> {
    const cover = alias(schema.projectImage, 'cover');
    return db
      .select({
        id: schema.project.id,
        slug: schema.project.slug,
        title: schema.project.title,
        citySlug: schema.project.citySlug,
        localitySlug: schema.project.localitySlug,
        budgetBandSlug: schema.project.budgetBandSlug,
        scopeSlug: schema.project.scopeSlug,
        bhkSlug: schema.project.bhkSlug,
        propertySubtypeSlug: schema.project.propertySubtypeSlug,
        studio: schema.designerProfile.displayName,
        rating: schema.designerProfile.avgRating,
        reviewCount: schema.designerProfile.reviewCount,
        coverStatus: cover.status,
        coverDerivatives: cover.derivatives,
        coverWidth: cover.width,
        coverHeight: cover.height,
      })
      .from(schema.project)
      .innerJoin(schema.designerProfile, eq(schema.project.designerId, schema.designerProfile.id))
      .leftJoin(cover, eq(schema.project.coverImageId, cover.id))
      .where(
        and(
          eq(schema.project.status, 'published'),
          eq(schema.designerProfile.status, 'active'),
          sql`${schema.project.id} != ${sourceProject.id}`,
          sql`${schema.project.citySlug} = ${sourceProject.citySlug}`,
          sql`${schema.project.scopeSlug} = ${sourceProject.scopeSlug}`,
          sql`${schema.project.budgetBandSlug} = ${sourceProject.budgetBandSlug}`,
          sql`${schema.project.bhkSlug} = ${sourceProject.bhkSlug}`,
        ),
      )
      .orderBy(
        sql`${schema.project.publishedAt} desc nulls last`,
        desc(schema.project.createdAt),
      )
      .limit(limit);
  },
};
