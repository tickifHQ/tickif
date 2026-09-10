import { describe, expect, it, vi } from 'vitest';
import { db, schema, eq } from '@repo/db';
import {
  makeUser,
  makeDesigner,
  makeProject,
  makeProjectImage,
  makeProjectRoom,
} from '@repo/db/testing';
import { projectsRepository } from '../../../src/modules/projects/repository.js';
import { adminProjectsRepository } from '../../../src/modules/admin-projects/repository.js';
import { adminProjectsService } from '../../../src/modules/admin-projects/service.js';
import { projectsService } from '../../../src/modules/projects/service.js';
import { readProjectAggregate } from '../../../src/modules/project-versions/repository.js';
import { mediaRepository } from '../../../src/modules/media/repository.js';

async function publishedProject() {
  const actor = await makeUser();
  const designer = await makeDesigner({ userId: actor.id, status: 'active', projectCount: 1 });
  const project = await makeProject({
    designerId: designer.id,
    status: 'published',
    title: 'Approved home',
    citySlug: 'mumbai',
    propertyTypeSlug: 'residential',
    scopeSlug: 'full-home',
    budgetBandSlug: 'premium',
    publishedAt: new Date('2026-01-01T00:00:00Z'),
    description: 'Approved description',
  });
  const room = await makeProjectRoom({ projectId: project.id });
  const images = await Promise.all(
    Array.from({ length: 5 }, (_, index) =>
      makeProjectImage({
        projectId: project.id,
        roomId: room.id,
        status: 'ready',
        sortOrder: index,
        originalKey: `originals/${project.id}/${index}.jpg`,
        themeSlugs: ['modern'],
        finishSlugs: ['veneer'],
      }),
    ),
  );
  await db
    .update(schema.project)
    .set({ coverImageId: images[0]!.id })
    .where(eq(schema.project.id, project.id));
  return { actor, designer, project, room, images };
}

async function startPendingReview(fixture: Awaited<ReturnType<typeof publishedProject>>) {
  await projectsRepository.updateDraft(fixture.project.id, { budgetBandSlug: 'luxury' });
  const submitted = await projectsRepository.submitWithUploadCounts(fixture.project.id, {
    actorUserId: fixture.actor.id,
    expectedStatus: 'draft',
    action: 'submit',
    minImageCount: 3,
  });
  expect(submitted.submitted?.status).toBe('submitted');
  const reviewed = await projectsRepository.transition({
    id: fixture.project.id,
    fromStatus: 'submitted',
    toStatus: 'in_review',
    actorUserId: fixture.actor.id,
    action: 'start_review',
    patch: { reviewedBy: fixture.actor.id, reviewStartedAt: new Date() },
  });
  expect(reviewed).toMatchObject({ status: 'in_review', pendingChanges: true });
}

describe('bounded live project versions', () => {
  it.each(['minor edit', 'approved pending edit'] as const)(
    'refreshes project and designer search terms after a %s',
    async (edit) => {
      const fixture = await publishedProject();
      if (edit === 'minor edit') {
        await projectsRepository.updateDraft(fixture.project.id, {
          description: 'Fresh public terms',
        });
      } else {
        await startPendingReview(fixture);
        await projectsRepository.transition({
          id: fixture.project.id,
          fromStatus: 'in_review',
          toStatus: 'published',
          actorUserId: fixture.actor.id,
          action: 'publish',
          requireNoUnresolvedReviewComments: true,
        });
      }
      const events = await db.select().from(schema.searchProjectionOutbox);
      expect(events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            entityKind: 'project',
            entityId: fixture.project.id,
            operation: 'index',
          }),
          expect.objectContaining({
            entityKind: 'designer',
            entityId: fixture.designer.id,
            operation: 'index',
          }),
        ]),
      );
    },
  );
  it('filters, counts and paginates the pending title, locality and update date shown in the dashboard', async () => {
    const fixture = await publishedProject();
    await db.insert(schema.member).values({
      id: `owner-${fixture.actor.id}`,
      userId: fixture.actor.id,
      organizationId: fixture.designer.orgId,
      role: 'owner',
      createdAt: new Date(),
    });
    await db
      .update(schema.project)
      .set({ localitySlug: 'old-locality', updatedAt: new Date('2020-01-01') })
      .where(eq(schema.project.id, fixture.project.id));
    const other = await makeProject({
      designerId: fixture.designer.id,
      title: 'Middle home',
      updatedAt: new Date('2025-01-01'),
    });
    await projectsRepository.updateDraft(fixture.project.id, {
      title: 'Renamed home',
      localitySlug: 'new-locality',
    });
    const params = {
      userId: fixture.actor.id,
      activeOrgId: fixture.designer.orgId,
      activeTeamId: null,
      limit: 1,
      offset: 0,
      sort: 'title' as const,
    };
    for (const q of ['Renamed home', 'new-locality']) {
      const result = await projectsRepository.list({ ...params, q });
      expect(result.total).toBe(1);
      expect(result.items[0]).toMatchObject({
        id: fixture.project.id,
        title: 'Renamed home',
        localitySlug: 'new-locality',
      });
    }
    for (const q of ['Approved home', 'old-locality']) {
      expect(await projectsRepository.list({ ...params, q })).toMatchObject({
        items: [],
        total: 0,
      });
    }
    expect((await projectsRepository.list(params)).items[0]?.id).toBe(other.id);
    const second = await projectsRepository.list({ ...params, offset: 1 });
    expect(second.total).toBe(2);
    expect(second.items[0]?.id).toBe(fixture.project.id);
    for (const sort of ['-title', '-updatedAt'] as const) {
      expect((await projectsRepository.list({ ...params, sort })).items[0]?.id).toBe(
        fixture.project.id,
      );
    }
    expect((await projectsRepository.list({ ...params, sort: 'updatedAt' })).items[0]?.id).toBe(
      other.id,
    );
    await projectsRepository.updateDraft(fixture.project.id, { localitySlug: null });
    expect((await projectsRepository.list({ ...params, q: 'old-locality' })).total).toBe(0);
    expect(
      (await projectsRepository.findLiveByIdWithRooms(fixture.project.id))?.project.title,
    ).toBe('Approved home');
  });

  it('duplicates approved scalar fields and media together while material edits are pending', async () => {
    const fixture = await publishedProject();
    await projectsRepository.updateDraft(fixture.project.id, {
      title: 'Pending home',
      citySlug: 'pune',
      budgetBandSlug: 'luxury',
      description: 'Pending description',
    });
    await projectsRepository.deleteImage(fixture.project.id, fixture.images[4]!.id);
    const pending = (await projectsRepository.findById(fixture.project.id))!;
    const duplicate = await projectsRepository.duplicateProject({
      source: pending,
      title: 'Approved home copy',
      slug: 'approved-home-copy',
    });
    expect(duplicate.project).toMatchObject({
      status: 'draft',
      citySlug: 'mumbai',
      budgetBandSlug: 'premium',
      description: 'Approved description',
    });
    expect(duplicate.rooms.map((room) => room.name)).toEqual([fixture.room.name]);
    const copiedImages = await db
      .select()
      .from(schema.projectImage)
      .where(eq(schema.projectImage.projectId, duplicate.project.id));
    expect(copiedImages.map((image) => image.originalKey).sort()).toEqual(
      fixture.images.map((image) => image.originalKey).sort(),
    );
    expect(
      copiedImages.find((image) => image.id === duplicate.project.coverImageId)?.originalKey,
    ).toBe(fixture.images[0]!.originalKey);
  });

  it('orders the review queue by the pending submission date rather than the original review', async () => {
    const first = await publishedProject();
    const second = await publishedProject();
    for (const [index, fixture] of [first, second].entries()) {
      await projectsRepository.updateDraft(fixture.project.id, { budgetBandSlug: 'luxury' });
      await projectsRepository.submitWithUploadCounts(fixture.project.id, {
        actorUserId: fixture.actor.id,
        expectedStatus: 'draft',
        action: 'submit',
        minImageCount: 3,
      });
      const state = (await readProjectAggregate(fixture.project.id))!;
      await db
        .update(schema.project)
        .set({ submittedAt: new Date(index === 0 ? '2020-01-01' : '2021-01-01') })
        .where(eq(schema.project.id, fixture.project.id));
      await db
        .update(schema.projectPendingVersion)
        .set({
          content: {
            ...state.current,
            project: {
              ...state.current.project,
              submittedAt: new Date(index === 0 ? '2026-09-02' : '2026-09-01'),
            },
          },
        })
        .where(eq(schema.projectPendingVersion.projectId, fixture.project.id));
    }
    const queue = await adminProjectsRepository.list({
      status: 'submitted',
      sort: 'oldest',
      page: 1,
      limit: 1,
    });
    expect(queue.total).toBe(2);
    expect(queue.items[0]?.id).toBe(second.project.id);
    expect(queue.items[0]?.submittedAt).toEqual(new Date('2026-09-01'));
  });

  it.each(['draft', 'submitted', 'in_review', 'changes_requested'] as const)(
    'lets an admin unpublish the live project while pending changes are %s',
    async (pendingStatus) => {
      const fixture = await publishedProject();
      await projectsRepository.updateDraft(fixture.project.id, { budgetBandSlug: 'luxury' });
      await db
        .update(schema.projectPendingVersion)
        .set({ status: pendingStatus })
        .where(eq(schema.projectPendingVersion.projectId, fixture.project.id));
      await adminProjectsService.unpublish(
        fixture.project.id,
        { note: 'Temporarily remove listing' },
        {
          userId: fixture.actor.id,
          userRole: 'superadmin',
        },
      );
      const state = (await readProjectAggregate(fixture.project.id))!;
      expect(state.pending).toBeNull();
      expect(state.live.project).toMatchObject({ status: 'in_review', budgetBandSlug: 'premium' });
      expect(await projectsRepository.findPublicProjectById(fixture.project.id)).toBeNull();
      const [designer] = await db
        .select()
        .from(schema.designerProfile)
        .where(eq(schema.designerProfile.id, fixture.designer.id));
      expect(designer?.projectCount).toBe(0);
      const events = await db.select().from(schema.searchProjectionOutbox);
      const projectEvents = events.filter((event) => event.entityKind === 'project');
      expect(projectEvents).toHaveLength(1);
      expect(projectEvents[0]?.operation).toBe('delete');
    },
  );

  it('reports the cover requirement when a pending cover fails despite five eligible images', async () => {
    const fixture = await publishedProject();
    const upload = await mediaRepository.createProcessing({
      projectId: fixture.project.id,
      originalKey: `originals/${fixture.project.id}/failed-cover.jpg`,
      contentType: 'image/jpeg',
    });
    await mediaRepository.updateMetadata(upload!.id, {
      roomId: fixture.room.id,
      themeSlugs: ['modern'],
      finishSlugs: ['veneer'],
    });
    await projectsRepository.updateDraft(fixture.project.id, { coverImageId: upload!.id });
    await db
      .update(schema.projectImage)
      .set({ status: 'failed' })
      .where(eq(schema.projectImage.id, upload!.id));
    const result = await projectsRepository.submitWithUploadCounts(fixture.project.id, {
      actorUserId: fixture.actor.id,
      expectedStatus: 'draft',
      action: 'submit',
      minImageCount: 3,
    });
    expect(result).toMatchObject({
      submitted: null,
      missingCover: true,
      counts: { imageCount: 5 },
    });
    expect((await readProjectAggregate(fixture.project.id))!.live.project.coverImageId).toBe(
      fixture.images[0]!.id,
    );
  });

  it('keeps the approved cover live until a minor cover removal has a ready replacement', async () => {
    const fixture = await publishedProject();
    await projectsRepository.deleteImage(fixture.project.id, fixture.images[0]!.id);
    let state = (await readProjectAggregate(fixture.project.id))!;
    expect(state.pending).not.toBeNull();
    expect(state.live.project.coverImageId).toBe(fixture.images[0]!.id);
    expect(state.live.images).toHaveLength(5);
    expect(state.current.project.coverImageId).toBeNull();
    await projectsRepository.updateDraft(fixture.project.id, { description: 'Minor copy change' });
    expect((await readProjectAggregate(fixture.project.id))!.live.project.coverImageId).toBe(
      fixture.images[0]!.id,
    );
    await projectsRepository.updateDraft(fixture.project.id, {
      coverImageId: fixture.images[1]!.id,
    });
    state = (await readProjectAggregate(fixture.project.id))!;
    expect(state.pending).toBeNull();
    expect(state.live.project.coverImageId).toBe(fixture.images[1]!.id);
    expect(state.live.images).toHaveLength(4);
  });

  it('stages an explicit cover clear without clearing the public cover', async () => {
    const fixture = await publishedProject();
    await projectsRepository.updateDraft(fixture.project.id, { coverImageId: null });
    const state = (await readProjectAggregate(fixture.project.id))!;
    expect(state.pending).not.toBeNull();
    expect(state.current.project.coverImageId).toBeNull();
    expect(state.live.project.coverImageId).toBe(fixture.images[0]!.id);
  });

  it('keeps public scalar and gallery reads on one version when approval commits between them', async () => {
    const fixture = await publishedProject();
    await projectsRepository.updateDraft(fixture.project.id, { budgetBandSlug: 'luxury' });
    await projectsRepository.deleteImage(fixture.project.id, fixture.images[4]!.id);
    await projectsRepository.deleteImage(fixture.project.id, fixture.images[3]!.id);
    await startPendingReview(fixture);
    const lookup = (await projectsRepository.findPublicProjectById(fixture.project.id))!;
    const read = projectsRepository.findPublicProjectById.bind(projectsRepository);
    const spy = vi
      .spyOn(projectsRepository, 'findPublicProjectById')
      .mockImplementation(async (id, reader) => {
        const result = await read(id, reader);
        if (reader) {
          await projectsRepository.transition({
            id,
            fromStatus: 'in_review',
            toStatus: 'published',
            actorUserId: fixture.actor.id,
            action: 'publish',
            requireNoUnresolvedReviewComments: true,
          });
        }
        return result;
      });
    try {
      const snapshot = (await projectsRepository.readPublicProjectSnapshot(lookup, true))!;
      expect(snapshot.result.project.budgetBandSlug).toBe('premium');
      expect(snapshot.galleryImages).toHaveLength(5);
    } finally {
      spy.mockRestore();
    }
    expect(
      (await projectsRepository.findPublicProjectById(fixture.project.id))!.project.budgetBandSlug,
    ).toBe('luxury');
    expect(await projectsRepository.listPublicGalleryImages(fixture.project.id)).toHaveLength(3);
  });

  it('serializes concurrent material edits without losing either pending change', async () => {
    const fixture = await publishedProject();
    await Promise.all([
      projectsRepository.updateDraft(fixture.project.id, { budgetBandSlug: 'luxury' }),
      projectsRepository.updateDraft(fixture.project.id, { citySlug: 'pune' }),
    ]);
    const state = (await readProjectAggregate(fixture.project.id))!;
    expect(state.current.project).toMatchObject({ budgetBandSlug: 'luxury', citySlug: 'pune' });
    expect(state.live.project).toMatchObject({ budgetBandSlug: 'premium', citySlug: 'mumbai' });
    expect(await db.select().from(schema.projectPendingVersion)).toHaveLength(1);
  });

  it('rejects every room and image mutation once the pending version enters review', async () => {
    const fixture = await publishedProject();
    await startPendingReview(fixture);
    const before = await readProjectAggregate(fixture.project.id);
    const mutations = [
      () => projectsRepository.updateRoom(fixture.project.id, fixture.room.id, { name: 'Changed' }),
      () => projectsRepository.deleteRoom(fixture.project.id, fixture.room.id),
      () =>
        projectsRepository.updateImageLink(fixture.project.id, fixture.images[0]!.id, {
          roomId: null,
        }),
      () => projectsRepository.deleteImage(fixture.project.id, fixture.images[0]!.id),
      () => mediaRepository.updateMetadata(fixture.images[0]!.id, { themeSlugs: [] }),
    ];
    for (const mutate of mutations) await expect(mutate()).rejects.toThrow('under review');
    expect(await readProjectAggregate(fixture.project.id)).toEqual(before);
  });

  it('refuses approval while any submitted image is still processing', async () => {
    const fixture = await publishedProject();
    await projectsRepository.updateDraft(fixture.project.id, { budgetBandSlug: 'luxury' });
    const upload = await mediaRepository.createProcessing({
      projectId: fixture.project.id,
      originalKey: `originals/${fixture.project.id}/pending.jpg`,
      contentType: 'image/jpeg',
    });
    await mediaRepository.updateMetadata(upload!.id, {
      roomId: fixture.room.id,
      themeSlugs: ['modern'],
      finishSlugs: ['veneer'],
    });
    await startPendingReview(fixture);
    const state = (await readProjectAggregate(fixture.project.id))!;
    const queue = await adminProjectsRepository.list({
      status: 'in_review',
      sort: 'oldest',
      page: 1,
      limit: 50,
    });
    expect(queue.items).toHaveLength(1);
    expect(queue.items[0]).toMatchObject({
      id: fixture.project.id,
      budgetBandSlug: 'luxury',
      imageCount: 6,
      taggedImageCount: 5,
    });
    const approved = await projectsRepository.transition({
      id: fixture.project.id,
      fromStatus: 'in_review',
      toStatus: 'published',
      actorUserId: fixture.actor.id,
      action: 'publish',
      expectedModerationRevision: state.pending!.revision,
      requireNoUnresolvedReviewComments: true,
    });
    expect(approved).toBeNull();
    expect((await readProjectAggregate(fixture.project.id))!.live).toEqual(state.live);
    expect(await db.select().from(schema.searchProjectionOutbox)).toHaveLength(0);
  });

  it('checks the locked pending metadata before committing submission', async () => {
    const fixture = await publishedProject();
    await projectsRepository.updateDraft(fixture.project.id, { budgetBandSlug: null });
    const result = await projectsRepository.submitWithUploadCounts(fixture.project.id, {
      actorUserId: fixture.actor.id,
      expectedStatus: 'draft',
      action: 'submit',
      minImageCount: 3,
    });
    expect(result.submitted).toBeNull();
    expect((await readProjectAggregate(fixture.project.id))!.pending?.status).toBe('draft');
    expect(await db.select().from(schema.projectModerationEvent)).toHaveLength(0);
  });

  it('keeps processing uploads private and publishes a ready minor addition without review', async () => {
    const fixture = await publishedProject();
    const upload = await mediaRepository.createProcessing({
      projectId: fixture.project.id,
      originalKey: `originals/${fixture.project.id}/minor-addition.jpg`,
      contentType: 'image/jpeg',
    });
    expect(upload).not.toBeNull();
    expect((await readProjectAggregate(fixture.project.id))!.live.images).toHaveLength(5);
    expect(await projectsRepository.findPublicProjectByImageId(upload!.id)).toBeNull();
    await db
      .update(schema.projectImage)
      .set({ status: 'ready' })
      .where(eq(schema.projectImage.id, upload!.id));
    await mediaRepository.updateMetadata(upload!.id, {
      roomId: fixture.room.id,
      themeSlugs: ['modern'],
      finishSlugs: ['veneer'],
    });
    const state = (await readProjectAggregate(fixture.project.id))!;
    expect(state.pending).toBeNull();
    expect(state.live.images).toHaveLength(6);
    expect(state.live.project.approvedImageIds).toHaveLength(5);
  });
  it('counts repeated image removals against the last approval rather than each autosave', async () => {
    const fixture = await publishedProject();
    await projectsRepository.deleteImage(fixture.project.id, fixture.images[4]!.id);
    let state = (await readProjectAggregate(fixture.project.id))!;
    expect(state.pending).toBeNull();
    expect(state.live.images).toHaveLength(4);
    await projectsRepository.deleteImage(fixture.project.id, fixture.images[3]!.id);
    state = (await readProjectAggregate(fixture.project.id))!;
    expect(state.pending).not.toBeNull();
    expect(state.live.images).toHaveLength(4);
    expect(state.current.images).toHaveLength(3);
    expect(state.live.project.approvedImageIds).toHaveLength(5);
  });

  it('publishes a separate minor edit during pending draft without exposing material changes', async () => {
    const fixture = await publishedProject();
    await projectsRepository.updateDraft(fixture.project.id, { budgetBandSlug: 'luxury' });
    await projectsRepository.updateDraft(fixture.project.id, { description: 'New description' });
    const state = (await readProjectAggregate(fixture.project.id))!;
    expect(state.live.project).toMatchObject({
      description: 'New description',
      budgetBandSlug: 'premium',
    });
    expect(state.current.project).toMatchObject({
      description: 'New description',
      budgetBandSlug: 'luxury',
    });
  });
  it('keeps live content and anonymous responses unchanged through re-review, and discards rejection', async () => {
    const fixture = await publishedProject();
    const before = (await readProjectAggregate(fixture.project.id))!.live;
    await startPendingReview(fixture);
    expect((await readProjectAggregate(fixture.project.id))!.live).toEqual(before);
    expect(await projectsService.getById(fixture.project.id)).toMatchObject({
      status: 'published',
      budgetBandSlug: 'premium',
    });
    expect(await projectsService.getById(fixture.project.id)).not.toHaveProperty('pendingChanges');
    expect(await projectsRepository.findPublicProjectBySlug(fixture.project.slug)).toMatchObject({
      project: expect.objectContaining({ budgetBandSlug: 'premium' }),
    });
    const similar = vi.spyOn(projectsRepository, 'findSimilarPublished');
    try {
      await expect(projectsService.similarProjects(fixture.project.id)).resolves.toEqual({
        projects: [],
      });
      expect(similar).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'published',
          budgetBandSlug: 'premium',
          citySlug: 'mumbai',
          title: 'Approved home',
        }),
        8,
      );
    } finally {
      similar.mockRestore();
    }
    await projectsRepository.transition({
      id: fixture.project.id,
      fromStatus: 'in_review',
      toStatus: 'rejected',
      actorUserId: fixture.actor.id,
      action: 'reject',
      note: 'Keep the existing budget',
      reasonCode: 'other',
      reasonCodes: ['other'],
    });
    expect((await readProjectAggregate(fixture.project.id))!.live).toEqual(before);
    expect((await readProjectAggregate(fixture.project.id))!.pending).toBeNull();
    expect(await db.select().from(schema.searchProjectionOutbox)).toHaveLength(0);
  });

  it('promotes corrected pending content once while preserving URL, publish date and counts', async () => {
    const fixture = await publishedProject();
    await startPendingReview(fixture);
    const pending = (await readProjectAggregate(fixture.project.id))!.pending!;
    await adminProjectsRepository.correctMetadata({
      projectId: fixture.project.id,
      actorUserId: fixture.actor.id,
      patch: { budgetBandSlug: 'corrected' },
      fieldDiff: { budgetBandSlug: { from: 'luxury', to: 'corrected' } },
      expectedRevision: pending.revision,
    });
    expect((await readProjectAggregate(fixture.project.id))!.live.project.budgetBandSlug).toBe(
      'premium',
    );
    const state = (await readProjectAggregate(fixture.project.id))!;
    const results = await Promise.all(
      [0, 1].map(() =>
        projectsRepository.transition({
          id: fixture.project.id,
          fromStatus: 'in_review',
          toStatus: 'published',
          actorUserId: fixture.actor.id,
          action: 'publish',
          expectedModerationRevision: state.pending!.revision,
          requireNoUnresolvedReviewComments: true,
        }),
      ),
    );
    expect(results.filter(Boolean)).toHaveLength(1);
    const final = (await readProjectAggregate(fixture.project.id))!;
    expect(final.pending).toBeNull();
    expect(final.live.project).toMatchObject({
      status: 'published',
      budgetBandSlug: 'corrected',
      slug: fixture.project.slug,
      publishedAt: fixture.project.publishedAt,
    });
    const projectionEvents = await db
      .select({
        entityKind: schema.searchProjectionOutbox.entityKind,
        entityId: schema.searchProjectionOutbox.entityId,
        operation: schema.searchProjectionOutbox.operation,
      })
      .from(schema.searchProjectionOutbox);
    expect(projectionEvents).toHaveLength(2);
    expect(projectionEvents).toEqual(
      expect.arrayContaining([
        { entityKind: 'project', entityId: fixture.project.id, operation: 'index' },
        { entityKind: 'designer', entityId: fixture.designer.id, operation: 'index' },
      ]),
    );
    const [designer] = await db
      .select()
      .from(schema.designerProfile)
      .where(eq(schema.designerProfile.id, fixture.designer.id));
    expect(designer?.projectCount).toBe(1);
    const events = await db
      .select()
      .from(schema.projectModerationEvent)
      .where(eq(schema.projectModerationEvent.projectId, fixture.project.id));
    expect(events.find((event) => event.action === 'metadata_corrected')?.fieldDiff).toEqual({
      budgetBandSlug: { from: 'luxury', to: 'corrected' },
    });
  });

  it('publishes minor metadata immediately and preserves approved media during material removals', async () => {
    const fixture = await publishedProject();
    await projectsRepository.updateDraft(fixture.project.id, {
      description: 'Clearer description',
    });
    let state = (await readProjectAggregate(fixture.project.id))!;
    expect(state.pending).toBeNull();
    expect(state.live.project.description).toBe('Clearer description');
    await projectsRepository.updateDraft(fixture.project.id, { budgetBandSlug: 'luxury' });
    await projectsRepository.deleteImage(fixture.project.id, fixture.images[1]!.id);
    await projectsRepository.deleteImage(fixture.project.id, fixture.images[2]!.id);
    state = (await readProjectAggregate(fixture.project.id))!;
    expect(state.live.images).toHaveLength(5);
    expect(state.current.images).toHaveLength(3);
    expect(await projectsRepository.listPublicGalleryImages(fixture.project.id)).toHaveLength(5);
    expect(await db.select().from(schema.projectPendingVersion)).toHaveLength(1);
  });

  it('retains pending notes for changes requested and rejects edits during active review', async () => {
    const fixture = await publishedProject();
    await startPendingReview(fixture);
    await expect(
      projectsRepository.updateDraft(fixture.project.id, { description: 'Race' }),
    ).rejects.toThrow('under review');
    await projectsRepository.transition({
      id: fixture.project.id,
      fromStatus: 'in_review',
      toStatus: 'changes_requested',
      actorUserId: fixture.actor.id,
      action: 'request_changes',
      patch: {
        moderationNote: 'Correct the budget',
        rejectionReasonCodes: ['budget-scope-clarity'],
      },
      note: 'Correct the budget',
      reasonCodes: ['budget-scope-clarity'],
    });
    const state = (await readProjectAggregate(fixture.project.id))!;
    expect(state.current.project).toMatchObject({
      status: 'changes_requested',
      moderationNote: 'Correct the budget',
      rejectionReasonCodes: ['budget-scope-clarity'],
      budgetBandSlug: 'luxury',
    });
    expect(state.live.project).toMatchObject({
      status: 'published',
      moderationNote: null,
      budgetBandSlug: 'premium',
    });
    const events = await db.select().from(schema.projectModerationEvent);
    expect(events.find((event) => event.action === 'request_changes')?.reasonCodes).toEqual([
      'budget-scope-clarity',
    ]);
    const resubmitted = await projectsRepository.submitWithUploadCounts(fixture.project.id, {
      actorUserId: fixture.actor.id,
      expectedStatus: 'changes_requested',
      action: 'resubmit',
      minImageCount: 3,
    });
    expect(resubmitted.submitted?.rejectionReasonCodes).toEqual([]);
  });
});
