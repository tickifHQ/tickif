import { describe, expect, it } from 'vitest';
import { db, eq, schema } from '@repo/db';
import { makeDesigner, makeProject, makeProjectImage, makeProjectRoom } from '@repo/db/testing';
import { findProjectSearchSource } from '../../src/search/repository.js';

describe('live project search projection', () => {
  it('omits pending scalar changes, rooms and image taxonomy from indexing and rebuild sources', async () => {
    const designer = await makeDesigner({ status: 'active' });
    const project = await makeProject({
      designerId: designer.id,
      status: 'published',
      publishedAt: new Date(),
      title: 'Approved home',
    });
    const room = await makeProjectRoom({ projectId: project.id, name: 'Approved room' });
    const hiddenRoom = await makeProjectRoom({
      projectId: project.id,
      name: 'Secret pending room',
      isLive: false,
    });
    const image = await makeProjectImage({
      projectId: project.id,
      roomId: room.id,
      status: 'ready',
      themeSlugs: ['approved-theme'],
    });
    const hiddenImage = await makeProjectImage({
      projectId: project.id,
      roomId: hiddenRoom.id,
      status: 'ready',
      themeSlugs: ['secret-pending-theme'],
      isLive: false,
    });
    await db
      .update(schema.project)
      .set({ coverImageId: image.id })
      .where(eq(schema.project.id, project.id));
    await db.insert(schema.projectPendingVersion).values({
      projectId: project.id,
      status: 'in_review',
      content: {
        project: {
          ...project,
          title: 'Secret pending title',
          citySlug: 'secret-pending-city',
          coverImageId: hiddenImage.id,
        },
        rooms: [hiddenRoom],
        images: [hiddenImage],
      },
    });
    const source = await findProjectSearchSource(project.id);
    expect(source?.project.title).toBe('Approved home');
    expect(source?.cover?.id).toBe(image.id);
    expect(source?.rooms.map((item) => item.name)).toEqual(['Approved room']);
    expect(source?.images.flatMap((item) => item.themeSlugs)).toEqual(['approved-theme']);
    expect(JSON.stringify(source)).not.toContain('secret-pending');
    expect(source).not.toHaveProperty('pendingChanges');
  });
});
