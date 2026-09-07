import { describe, expect, it, vi } from 'vitest';
import { db, eq, schema } from '@repo/db';
import {
  makeDesigner,
  makeProject,
  makeProjectImage,
  makeProjectRoom,
  makeUser,
} from '@repo/db/testing';
import { projectsRepository } from '../../../src/modules/projects/repository.js';
import { mediaRepository } from '../../../src/modules/media/repository.js';
import { mediaService } from '../../../src/modules/media/service.js';

async function completeDraft() {
  const actor = await makeUser();
  const designer = await makeDesigner({ userId: actor.id });
  const project = await makeProject({
    designerId: designer.id,
    status: 'draft',
    citySlug: 'mumbai',
    propertyTypeSlug: 'residential',
    scopeSlug: 'full-home',
    budgetBandSlug: 'premium',
  });
  const room = await makeProjectRoom({ projectId: project.id });
  const images = await Promise.all(
    [0, 1, 2].map((sortOrder) =>
      makeProjectImage({
        projectId: project.id,
        roomId: room.id,
        status: 'ready',
        sortOrder,
        themeSlugs: ['modern'],
        finishSlugs: ['veneer'],
      }),
    ),
  );
  const submit = () =>
    projectsRepository.submitWithUploadCounts(project.id, {
      actorUserId: actor.id,
      expectedStatus: 'draft',
      action: 'submit',
      minImageCount: 3,
    });
  return { actor, project, room, images, submit };
}

describe('transactional cover submit gate', () => {
  it.each(['citySlug', 'propertyTypeSlug', 'scopeSlug', 'budgetBandSlug'] as const)(
    'does not commit submission after a draft patch clears %s',
    async (field) => {
      const { project, images, submit } = await completeDraft();
      await projectsRepository.updateDraft(project.id, {
        coverImageId: images[0]!.id,
        [field]: null,
      });
      expect((await submit()).submitted).toBeNull();
      const [stored] = await db
        .select()
        .from(schema.project)
        .where(eq(schema.project.id, project.id));
      expect(stored?.status).toBe('draft');
      const events = await db
        .select()
        .from(schema.projectModerationEvent)
        .where(eq(schema.projectModerationEvent.projectId, project.id));
      expect(events).toEqual([]);
    },
  );

  it('does not submit a whitespace-only title from the locked project snapshot', async () => {
    const { project, images, submit } = await completeDraft();
    await db
      .update(schema.project)
      .set({ title: '  ', coverImageId: images[0]!.id })
      .where(eq(schema.project.id, project.id));
    expect((await submit()).submitted).toBeNull();
  });

  it.each(['deleteRoom', 'updateImageLink', 'updateMetadata'] as const)(
    'rejects stale %s writes after submission without detaching the cover',
    async (operation) => {
      const { project, room, images, submit } = await completeDraft();
      const cover = images[0]!;
      await projectsRepository.updateDraft(project.id, { coverImageId: cover.id });
      expect((await submit()).submitted?.status).toBe('submitted');
      if (operation === 'deleteRoom') {
        expect(await projectsRepository.deleteRoom(project.id, room.id)).toBe(false);
      } else if (operation === 'updateImageLink') {
        expect(
          await projectsRepository.updateImageLink(project.id, cover.id, { roomId: null }),
        ).toBeNull();
      } else {
        expect(await mediaRepository.updateMetadata(cover.id, { roomId: null })).toBeNull();
      }
      expect(await projectsRepository.findImage(project.id, cover.id)).toMatchObject({
        roomId: room.id,
      });
    },
  );

  it('returns a conflict when media authorization read draft before submission', async () => {
    const { actor, project, images, submit } = await completeDraft();
    const cover = images[0]!;
    await projectsRepository.updateDraft(project.id, { coverImageId: cover.id });
    const staleImage = await mediaRepository.findImageWithOwner(cover.id);
    expect((await submit()).submitted?.status).toBe('submitted');
    const lookup = vi
      .spyOn(mediaRepository, 'findImageWithOwner')
      .mockResolvedValueOnce(staleImage);
    try {
      await expect(
        mediaService.updateImageMetadata({
          imageId: cover.id,
          metadata: { roomId: null },
          userId: actor.id,
          userRole: 'designer',
        }),
      ).rejects.toMatchObject({ status: 409 });
    } finally {
      lookup.mockRestore();
    }
  });

  it('rejects a stale draft patch that would clear the cover after submission', async () => {
    const { project, images, submit } = await completeDraft();
    await projectsRepository.updateDraft(project.id, { coverImageId: images[0]!.id });
    expect((await submit()).submitted?.status).toBe('submitted');
    expect(await projectsRepository.updateDraft(project.id, { coverImageId: null })).toBeNull();
  });
  it('blocks a complete image set without a selected cover and records no transition', async () => {
    const { project, submit } = await completeDraft();
    expect(await submit()).toMatchObject({ submitted: null, missingCover: true });
    const events = await db
      .select()
      .from(schema.projectModerationEvent)
      .where(eq(schema.projectModerationEvent.projectId, project.id));
    expect(events).toEqual([]);
  });

  it('rejects cross-project and failed cover images even when the other photos are complete', async () => {
    const { project, submit } = await completeDraft();
    const other = await completeDraft();
    await db
      .update(schema.project)
      .set({ coverImageId: other.images[0]!.id })
      .where(eq(schema.project.id, project.id));
    expect(await submit()).toMatchObject({ submitted: null, missingCover: true });
    const failed = await makeProjectImage({ projectId: project.id, status: 'failed' });
    await db
      .update(schema.project)
      .set({ coverImageId: failed.id })
      .where(eq(schema.project.id, project.id));
    expect(await submit()).toMatchObject({ submitted: null, missingCover: true });
  });

  it('serializes cover deletion with submission so a submitted project always retains its cover', async () => {
    const { project, images, submit } = await completeDraft();
    const cover = images[0]!;
    await db
      .update(schema.project)
      .set({ coverImageId: cover.id })
      .where(eq(schema.project.id, project.id));
    await Promise.all([submit(), projectsRepository.deleteImage(project.id, cover.id)]);
    const [stored] = await db
      .select()
      .from(schema.project)
      .where(eq(schema.project.id, project.id));
    const image = await projectsRepository.findImage(project.id, cover.id);
    if (stored?.status === 'submitted') {
      expect(stored.coverImageId).toBe(cover.id);
      expect(image?.id).toBe(cover.id);
    } else {
      expect(stored).toMatchObject({ status: 'draft', coverImageId: null });
      expect(image).toBeNull();
    }
  });
});
