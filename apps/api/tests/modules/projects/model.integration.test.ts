import { describe, it, expect } from 'vitest';
import { db, schema, eq } from '@repo/db';
import { makeProject, makeProjectImage, makeProjectRoom, makeTaxonomy } from '@repo/db/testing';

describe('project_room model (E-101)', () => {
  it('persists ordered rooms with a taxonomy room type and provisional labels', async () => {
    const project = await makeProject({ status: 'draft' });
    const roomType = await makeTaxonomy({
      kind: 'room',
      slug: 'living-room',
      label: 'Living Room',
    });
    const room = await makeProjectRoom({
      projectId: project.id,
      roomTypeId: roomType.id,
      name: 'Main Living Area',
      description: 'Open living and dining zone',
      sortOrder: 2,
      metadata: {
        labels: ['airy', 'wood tones'],
        attributeLabels: { finish: ['veneer'], layout: ['open-plan'] },
      },
    });

    const [row] = await db
      .select({
        id: schema.projectRoom.id,
        projectId: schema.projectRoom.projectId,
        roomTypeId: schema.projectRoom.roomTypeId,
        name: schema.projectRoom.name,
        description: schema.projectRoom.description,
        sortOrder: schema.projectRoom.sortOrder,
        metadata: schema.projectRoom.metadata,
      })
      .from(schema.projectRoom)
      .where(eq(schema.projectRoom.id, room.id));

    expect(row).toEqual({
      id: room.id,
      projectId: project.id,
      roomTypeId: roomType.id,
      name: 'Main Living Area',
      description: 'Open living and dining zone',
      sortOrder: 2,
      metadata: {
        labels: ['airy', 'wood tones'],
        attributeLabels: { finish: ['veneer'], layout: ['open-plan'] },
      },
    });
  });

  it('cascades rooms when the parent project is removed', async () => {
    const project = await makeProject({ status: 'draft' });
    const room = await makeProjectRoom({ projectId: project.id });

    await db.delete(schema.project).where(eq(schema.project.id, project.id));

    const rows = await db
      .select()
      .from(schema.projectRoom)
      .where(eq(schema.projectRoom.id, room.id));
    expect(rows).toHaveLength(0);
  });

  it('lets project images link to a room and preserves the image if that room is removed', async () => {
    const project = await makeProject({ status: 'draft' });
    const room = await makeProjectRoom({ projectId: project.id });
    const image = await makeProjectImage({ projectId: project.id, roomId: room.id });

    await db.delete(schema.projectRoom).where(eq(schema.projectRoom.id, room.id));

    const [row] = await db
      .select({ id: schema.projectImage.id, roomId: schema.projectImage.roomId })
      .from(schema.projectImage)
      .where(eq(schema.projectImage.id, image.id));

    expect(row).toEqual({ id: image.id, roomId: null });
  });
});
