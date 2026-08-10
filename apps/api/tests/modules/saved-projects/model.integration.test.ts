import { describe, expect, it } from 'vitest';
import { and, db, eq, schema } from '@repo/db';
import { makeDesigner, makeProject, makeUser } from '@repo/db/testing';

describe('saved_project model', () => {
  it('enforces one saved row per user and project', async () => {
    const user = await makeUser();
    const project = await makeProject();

    await db.insert(schema.savedProject).values({ userId: user.id, projectId: project.id });
    await expect(
      db.insert(schema.savedProject).values({ userId: user.id, projectId: project.id }),
    ).rejects.toMatchObject({ cause: { code: '23505' } });
  });

  it('cascades rows when either owning record is deleted', async () => {
    const firstUser = await makeUser();
    const secondUser = await makeUser();
    const firstProject = await makeProject();
    const secondDesigner = await makeDesigner({ userId: null });
    const secondProject = await makeProject({ designerId: secondDesigner.id });

    await db.insert(schema.savedProject).values([
      { userId: firstUser.id, projectId: firstProject.id },
      { userId: secondUser.id, projectId: secondProject.id },
    ]);

    await db.delete(schema.user).where(eq(schema.user.id, firstUser.id));
    await db.delete(schema.project).where(eq(schema.project.id, secondProject.id));

    const rows = await db
      .select()
      .from(schema.savedProject)
      .where(
        and(
          eq(schema.savedProject.userId, firstUser.id),
          eq(schema.savedProject.projectId, firstProject.id),
        ),
      );
    const allRows = await db.select().from(schema.savedProject);
    expect(rows).toHaveLength(0);
    expect(allRows).toHaveLength(0);
  });
});
