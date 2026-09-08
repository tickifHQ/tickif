import { describe, expect, it, vi } from 'vitest';
import { db, eq, schema, sql } from '@repo/db';
import { makeDesigner, makeProject, makeProjectImage, makeProjectRoom } from '@repo/db/testing';
import { markFailed } from '../../src/media/repository.js';

async function pendingUpload(status: 'draft' | 'submitted' | 'in_review' | 'changes_requested') {
  const designer = await makeDesigner({ projectCount: 1 });
  const project = await makeProject({
    designerId: designer.id,
    status: 'published',
    publishedAt: new Date('2026-01-01T00:00:00Z'),
    title: 'Approved home',
  });
  const room = await makeProjectRoom({ projectId: project.id });
  const image = await makeProjectImage({
    projectId: project.id,
    roomId: room.id,
    status: 'processing',
    isLive: false,
  });
  await db.insert(schema.projectPendingVersion).values({
    projectId: project.id,
    status,
    revision: 3,
    content: {
      project: { ...project, status, title: 'Pending home', moderationRevision: 3 },
      rooms: [room],
      images: [image],
    },
  });
  return { designer, project, image };
}

async function expectLiveUnchanged(fixture: Awaited<ReturnType<typeof pendingUpload>>) {
  const [project] = await db
    .select()
    .from(schema.project)
    .where(eq(schema.project.id, fixture.project.id));
  expect(project).toEqual(fixture.project);
  const [designer] = await db
    .select()
    .from(schema.designerProfile)
    .where(eq(schema.designerProfile.id, fixture.designer.id));
  expect(designer?.projectCount).toBe(1);
  expect(await db.select().from(schema.searchProjectionOutbox)).toEqual([]);
}

describe('pending upload failure isolation', () => {
  it.each(['draft', 'changes_requested'] as const)(
    'keeps a pending %s editable without changing approved content',
    async (status) => {
      const fixture = await pendingUpload(status);
      await markFailed(fixture.image.id);
      await expectLiveUnchanged(fixture);
      const [pending] = await db.select().from(schema.projectPendingVersion);
      expect(pending).toMatchObject({ status, revision: 3 });
      const [image] = await db.select().from(schema.projectImage);
      expect(image?.status).toBe('failed');
    },
  );

  it.each(['submitted', 'in_review'] as const)(
    'returns only the pending %s version for correction, idempotently',
    async (status) => {
      const fixture = await pendingUpload(status);
      await markFailed(fixture.image.id);
      await markFailed(fixture.image.id);
      await expectLiveUnchanged(fixture);
      const [pending] = await db.select().from(schema.projectPendingVersion);
      expect(pending).toMatchObject({
        status: 'changes_requested',
        revision: 4,
        content: {
          project: {
            title: 'Pending home',
            status: 'changes_requested',
            moderationRevision: 4,
            submittedAt: null,
            metadata: { mediaProcessingFailure: { imageId: fixture.image.id } },
          },
        },
      });
    },
  );

  it.each(['removed', 'discarded'] as const)(
    'ignores late failure from a %s pending asset',
    async (state) => {
      const fixture = await pendingUpload('submitted');
      if (state === 'discarded') {
        await db
          .delete(schema.projectPendingVersion)
          .where(eq(schema.projectPendingVersion.projectId, fixture.project.id));
      } else {
        const [pending] = await db.select().from(schema.projectPendingVersion);
        await db
          .update(schema.projectPendingVersion)
          .set({ content: { ...pending!.content, images: [] } })
          .where(eq(schema.projectPendingVersion.projectId, fixture.project.id));
      }
      const before = await db.select().from(schema.projectPendingVersion);
      await markFailed(fixture.image.id);
      await expectLiveUnchanged(fixture);
      expect(await db.select().from(schema.projectPendingVersion)).toEqual(before);
    },
  );

  it('takes the project lock before the image lock and honors a competing ready transition', async () => {
    const fixture = await pendingUpload('submitted');
    let failed: Promise<unknown> | undefined;
    try {
      await db.transaction(async (tx) => {
        await tx
          .select()
          .from(schema.project)
          .where(eq(schema.project.id, fixture.project.id))
          .for('update');
        failed = markFailed(fixture.image.id).catch((error: unknown) => error);
        // Wait for the worker's real database lock, not an arbitrary scheduling delay.
        await vi.waitFor(
          async () => {
            const waiting = await db.execute(sql`select pid from pg_stat_activity
            where datname = current_database() and pid <> pg_backend_pid()
              and wait_event_type = 'Lock' and query ilike '%for update%'`);
            expect(waiting.rows.length).toBeGreaterThan(0);
          },
          { timeout: 5_000 },
        );
        await tx
          .update(schema.projectImage)
          .set({ status: 'ready' })
          .where(eq(schema.projectImage.id, fixture.image.id));
      });
      expect(await failed).toBeUndefined();
    } finally {
      await failed;
    }
    await expectLiveUnchanged(fixture);
    const [image] = await db.select().from(schema.projectImage);
    expect(image?.status).toBe('ready');
  });
});
