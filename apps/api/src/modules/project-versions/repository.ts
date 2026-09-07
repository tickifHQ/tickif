import { db, schema, eq, and, inArray, type DbTransaction } from '@repo/db';
import { isDeepStrictEqual } from 'node:util';
import { classifyProjectEdit, type UpdateProjectInput } from '@repo/contracts';
import { recordSearchProjectionEvents } from '../search-index/repository.js';
import { AppError } from '../../lib/errors.js';

type Project = typeof schema.project.$inferSelect;
export type VersionedProject = Omit<Project, 'approvedImageIds'> & {
  approvedImageIds?: string[] | null;
  pendingChanges?: boolean;
  liveStatus?: 'published';
};
type Pending = typeof schema.projectPendingVersion.$inferSelect;
export type ProjectAggregate = schema.ProjectPendingContent;
type Reader = typeof db | DbTransaction;

function graphOrder(
  a: { sortOrder: number; createdAt: Date; id: string },
  b: { sortOrder: number; createdAt: Date; id: string },
) {
  return (
    a.sortOrder - b.sortOrder ||
    a.createdAt.getTime() - b.createdAt.getTime() ||
    a.id.localeCompare(b.id)
  );
}

function editableGraph(aggregate: ProjectAggregate) {
  return {
    project: projectContentFields(aggregate.project),
    rooms: aggregate.rooms.map(({ id, roomTypeId, name, description, sortOrder, metadata }) => ({
      id,
      roomTypeId,
      name,
      description,
      sortOrder,
      metadata,
    })),
    images: aggregate.images.map(
      ({ id, roomId, status, sortOrder, themeSlugs, materialSlugs, finishSlugs, tagSlugs }) => ({
        id,
        roomId,
        status,
        sortOrder,
        themeSlugs,
        materialSlugs,
        finishSlugs,
        tagSlugs,
      }),
    ),
  };
}

const dateFields = [
  'createdAt',
  'updatedAt',
  'publishedAt',
  'submittedAt',
  'reviewStartedAt',
  'featuredAt',
  'duplicateCheckedAt',
] as const;
function restoreDates<T extends object>(value: T): T {
  const result = { ...value };
  for (const key of dateFields) {
    if (key in result) {
      const record = result as Record<string, unknown>;
      if (typeof record[key] === 'string') record[key] = new Date(record[key]);
    }
  }
  return result;
}

export function projectContentFields(project: Project): UpdateProjectInput {
  return {
    title: project.title,
    description: project.description,
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
    coverImageId: project.coverImageId,
    metadata: project.metadata ?? {},
  };
}

export async function readProjectAggregate(
  id: string,
  reader: Reader = db,
  lock = false,
): Promise<{
  live: ProjectAggregate;
  current: ProjectAggregate;
  pending: Pending | null;
} | null> {
  const query = reader.select().from(schema.project).where(eq(schema.project.id, id)).limit(1);
  const [project] = await (lock ? query.for('update') : query);
  if (!project) return null;
  const rooms = await reader
    .select()
    .from(schema.projectRoom)
    .where(eq(schema.projectRoom.projectId, id));
  const images = await reader
    .select()
    .from(schema.projectImage)
    .where(eq(schema.projectImage.projectId, id));
  const [pending] = await reader
    .select()
    .from(schema.projectPendingVersion)
    .where(eq(schema.projectPendingVersion.projectId, id))
    .limit(1);
  const live = {
    project,
    rooms: rooms.filter((row) => row.isLive).sort(graphOrder),
    images: images
      .filter((row) => row.isLive && (project.status !== 'published' || row.status === 'ready'))
      .sort(graphOrder),
  };
  if (!pending || project.status !== 'published') return { live, current: live, pending: null };
  const assets = new Map(images.map((image) => [image.id, image]));
  const content = pending.content;
  return {
    live,
    pending,
    current: {
      project: {
        ...restoreDates(content.project),
        id: project.id,
        designerId: project.designerId,
        slug: project.slug,
        publishedAt: project.publishedAt,
        createdAt: project.createdAt,
        responsibleMemberId: project.responsibleMemberId,
        status: pending.status,
        moderationRevision: pending.revision,
      },
      rooms: content.rooms.map(restoreDates).sort(graphOrder),
      images: content.images
        .flatMap((image) => {
          const asset = assets.get(image.id);
          return asset
            ? [
                {
                  ...asset,
                  roomId: image.roomId,
                  sortOrder: image.sortOrder,
                  themeSlugs: image.themeSlugs,
                  materialSlugs: image.materialSlugs,
                  finishSlugs: image.finishSlugs,
                  tagSlugs: image.tagSlugs,
                },
              ]
            : [];
        })
        .sort(graphOrder),
    },
  };
}

export async function writePendingAggregate(
  tx: DbTransaction,
  aggregate: ProjectAggregate,
  revision: number,
): Promise<void> {
  await tx
    .insert(schema.projectPendingVersion)
    .values({
      projectId: aggregate.project.id,
      content: aggregate,
      status: aggregate.project.status,
      revision,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: schema.projectPendingVersion.projectId,
      set: {
        content: aggregate,
        status: aggregate.project.status,
        revision,
        updatedAt: new Date(),
      },
    });
}

export async function applyLiveAggregate(
  tx: DbTransaction,
  aggregate: ProjectAggregate,
  approved = false,
): Promise<Project> {
  const id = aggregate.project.id;
  const now = new Date();
  const baseline = approved
    ? aggregate.images.map((image) => image.id)
    : aggregate.project.approvedImageIds;
  const [updated] = await tx
    .update(schema.project)
    .set({
      ...projectContentFields(aggregate.project),
      approvedImageIds: baseline,
      updatedAt: now,
      ...(approved
        ? {
            submittedAt: aggregate.project.submittedAt,
            reviewedBy: aggregate.project.reviewedBy,
            reviewStartedAt: aggregate.project.reviewStartedAt,
            rejectionReasonCode: null,
            moderationNote: null,
            moderationRevision: aggregate.project.moderationRevision,
            featuredAt: aggregate.project.featuredAt,
          }
        : {}),
    })
    .where(eq(schema.project.id, id))
    .returning();
  if (!updated) throw new Error('Project disappeared while locked');
  await tx
    .update(schema.projectRoom)
    .set({ isLive: false })
    .where(eq(schema.projectRoom.projectId, id));
  for (const room of aggregate.rooms) {
    await tx
      .insert(schema.projectRoom)
      .values({ ...room, isLive: true })
      .onConflictDoUpdate({
        target: schema.projectRoom.id,
        set: {
          roomTypeId: room.roomTypeId,
          name: room.name,
          description: room.description,
          sortOrder: room.sortOrder,
          metadata: room.metadata,
          isLive: true,
          updatedAt: now,
        },
      });
  }
  await tx
    .update(schema.projectImage)
    .set({ isLive: false })
    .where(eq(schema.projectImage.projectId, id));
  for (const image of aggregate.images) {
    await tx
      .update(schema.projectImage)
      .set({
        roomId: image.roomId,
        sortOrder: image.sortOrder,
        themeSlugs: image.themeSlugs,
        materialSlugs: image.materialSlugs,
        finishSlugs: image.finishSlugs,
        tagSlugs: image.tagSlugs,
        isLive: true,
      })
      .where(and(eq(schema.projectImage.id, image.id), eq(schema.projectImage.projectId, id)));
  }
  if (updated.status === 'published') {
    await recordSearchProjectionEvents(tx, [
      { entityKind: 'project', entityId: id, operation: 'index', sourceUpdatedAt: now },
    ]);
  }
  return updated;
}

/** Every edit and promotion locks the same canonical row before looking at a pending version. */
export async function mutateProjectAggregate<T>(
  id: string,
  mutate: (aggregate: ProjectAggregate, tx: DbTransaction, published: boolean) => Promise<T> | T,
  options: { forcePending?: boolean } = {},
): Promise<{ value: T; project: Project } | null> {
  return db.transaction(async (tx) => {
    const state = await readProjectAggregate(id, tx, true);
    if (!state) return null;
    const published = state.live.project.status === 'published';
    if (
      !published &&
      !['draft', 'changes_requested', 'rejected'].includes(state.live.project.status)
    ) {
      throw AppError.conflict('Project is not editable in its current state');
    }
    if (state.pending && !['draft', 'changes_requested'].includes(state.pending.status)) {
      throw AppError.conflict('Pending changes are currently under review');
    }
    const current = structuredClone(state.current);
    if (published) current.project.approvedImageIds ??= state.live.images.map((image) => image.id);
    const value = await mutate(current, tx, published);
    if (
      current.project.coverImageId &&
      !current.images.some((image) => image.id === current.project.coverImageId)
    ) {
      throw AppError.unprocessable('Cover image must belong to the editable project version');
    }
    const roomIds = new Set(current.rooms.map((room) => room.id));
    if (current.images.some((image) => image.roomId && !roomIds.has(image.roomId))) {
      throw AppError.unprocessable('Image room must belong to the editable project version');
    }
    const hasReadyCover = current.images.some(
      (image) =>
        image.id === current.project.coverImageId && image.status === 'ready' && image.roomId,
    );
    const readyMinorPending =
      !!state.pending &&
      hasReadyCover &&
      current.images.every((image) => image.status === 'ready') &&
      classifyProjectEdit(
        projectContentFields(state.live.project),
        projectContentFields(current.project),
        current.project.approvedImageIds ?? state.live.images.map((image) => image.id),
        current.images.map((image) => image.id),
      ) === 'minor';
    if (
      isDeepStrictEqual(editableGraph(state.current), editableGraph(current)) &&
      !readyMinorPending
    ) {
      return { value, project: state.current.project };
    }
    // A new minor-only edit also updates matching live content while an older material edit waits.
    // Pending-only assets and fields changed by this material operation never cross this boundary.
    if (
      state.pending &&
      !readyMinorPending &&
      classifyProjectEdit(
        projectContentFields(state.current.project),
        projectContentFields(current.project),
        state.current.images.map((image) => image.id),
        current.images.map((image) => image.id),
      ) === 'minor'
    ) {
      const liveEdit = structuredClone(state.live);
      const before = projectContentFields(state.current.project);
      const next = projectContentFields(current.project);
      for (const key of Object.keys(next) as (keyof UpdateProjectInput)[]) {
        if (
          key === 'coverImageId' &&
          (!next.coverImageId || !liveEdit.images.some((image) => image.id === next.coverImageId))
        )
          continue;
        if (!isDeepStrictEqual(before[key], next[key]))
          Object.assign(liveEdit.project, { [key]: next[key] });
      }
      for (const liveRoom of liveEdit.rooms) {
        const previous = state.current.rooms.find((room) => room.id === liveRoom.id);
        const updated = current.rooms.find((room) => room.id === liveRoom.id);
        if (!previous || !updated) continue;
        for (const key of ['name', 'description', 'sortOrder', 'metadata'] as const) {
          if (!isDeepStrictEqual(previous[key], updated[key]))
            Object.assign(liveRoom, { [key]: updated[key] });
        }
      }
      for (const liveImage of liveEdit.images) {
        const previous = state.current.images.find((image) => image.id === liveImage.id);
        const updated = current.images.find((image) => image.id === liveImage.id);
        if (!previous || !updated) continue;
        for (const key of [
          'sortOrder',
          'themeSlugs',
          'materialSlugs',
          'finishSlugs',
          'tagSlugs',
        ] as const) {
          if (!isDeepStrictEqual(previous[key], updated[key]))
            Object.assign(liveImage, { [key]: updated[key] });
        }
      }
      if (!isDeepStrictEqual(editableGraph(state.live), editableGraph(liveEdit)))
        await applyLiveAggregate(tx, liveEdit);
    }
    const classification = classifyProjectEdit(
      projectContentFields(state.live.project),
      projectContentFields(current.project),
      current.project.approvedImageIds ?? state.live.images.map((image) => image.id),
      current.images.map((image) => image.id),
    );
    const needsPending =
      published &&
      (options.forcePending ||
        !hasReadyCover ||
        classification === 'material' ||
        current.images.some((image) => image.status !== 'ready'));
    if (needsPending) {
      current.project.status = state.pending?.status ?? 'draft';
      current.project.moderationRevision = (state.pending?.revision ?? 0) + 1;
      current.project.updatedAt = new Date();
      if (!state.pending) {
        current.project.submittedAt = null;
        current.project.reviewedBy = null;
        current.project.reviewStartedAt = null;
        current.project.moderationNote = null;
        current.project.rejectionReasonCode = null;
      }
      await writePendingAggregate(tx, current, current.project.moderationRevision);
      return { value, project: current.project };
    }
    const project = await applyLiveAggregate(tx, current);
    await tx
      .delete(schema.projectPendingVersion)
      .where(eq(schema.projectPendingVersion.projectId, id));
    return { value, project };
  });
}

export async function getPendingProject(id: string): Promise<VersionedProject | null> {
  return (await getPendingProjects([id])).get(id) ?? null;
}

export async function getPendingProjects(ids: string[]): Promise<Map<string, VersionedProject>> {
  if (!ids.length) return new Map();
  const rows = await db
    .select({ pending: schema.projectPendingVersion, live: schema.project })
    .from(schema.projectPendingVersion)
    .innerJoin(schema.project, eq(schema.project.id, schema.projectPendingVersion.projectId))
    .where(
      and(
        inArray(schema.projectPendingVersion.projectId, ids),
        eq(schema.project.status, 'published'),
      ),
    );
  return new Map(
    rows.map(({ pending, live }): [string, VersionedProject] => [
      live.id,
      {
        ...restoreDates(pending.content.project),
        id: live.id,
        designerId: live.designerId,
        slug: live.slug,
        publishedAt: live.publishedAt,
        createdAt: live.createdAt,
        responsibleMemberId: live.responsibleMemberId,
        status: pending.status,
        moderationRevision: pending.revision,
        pendingChanges: true,
        liveStatus: 'published',
      },
    ]),
  );
}
