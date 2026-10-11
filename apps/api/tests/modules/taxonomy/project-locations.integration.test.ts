import { describe, expect, it } from 'vitest';
import { seedProjectLocations } from '@repo/db/seeds/project-locations';
import { db, schema, eq } from '@repo/db';
import { makeDesigner, makeProject, makeProjectImage } from '@repo/db/testing';
import { app } from '../../../src/app.js';
import { listTaxonomyResponseSchema } from '@repo/contracts';
import { discoveryRepository } from '../../../src/modules/discovery/repository.js';
import { SORT_POSTGRES } from '../../../src/modules/discovery/constants.js';

async function feedIds(citySlug: string) {
  const feed = await discoveryRepository.listFeedFallback({
    filterBy: { citySlug },
    offset: 0,
    limit: 24,
    sortBy: SORT_POSTGRES.recent,
  });
  return feed.rows.map((row) => row.id);
}

describe('saved custom location classification', () => {
  it('makes an already published free-text city available in location options and filters, once', async () => {
    const designer = await makeDesigner({ status: 'active' });
    const project = await makeProject({
      designerId: designer.id,
      status: 'published',
      publishedAt: new Date(),
      citySlug: null,
      cityName: 'Legacy City',
    });
    await makeProjectImage({ projectId: project.id, status: 'ready', isLive: true });

    expect(await seedProjectLocations()).toEqual({ projects: 1, pendingVersions: 0, skipped: 0 });
    const response = await app.request('/api/taxonomy/terms?kind=city');
    expect(listTaxonomyResponseSchema.parse(await response.json()).terms).toContainEqual(
      expect.objectContaining({ label: 'Legacy City', slug: 'legacy-city' }),
    );
    expect(await feedIds('legacy-city')).toContain(project.id);
    const [updated] = await db
      .select()
      .from(schema.project)
      .where(eq(schema.project.id, project.id));
    expect(updated).toEqual({ ...project, citySlug: 'legacy-city' });
    const events = await db.select().from(schema.searchProjectionOutbox);
    expect(events).toEqual([
      expect.objectContaining({
        entityKind: 'project',
        entityId: project.id,
        operation: 'index',
        sourceUpdatedAt: project.updatedAt,
      }),
    ]);
    expect(await seedProjectLocations()).toEqual({ projects: 0, pendingVersions: 0, skipped: 0 });
    expect(await db.select().from(schema.searchProjectionOutbox)).toEqual(events);
  });

  it('classifies live and pending locations from their own names without publishing draft content', async () => {
    const designer = await makeDesigner({ status: 'active' });
    const project = await makeProject({
      designerId: designer.id,
      status: 'published',
      publishedAt: new Date(),
      citySlug: null,
      cityName: 'Approved City',
    });
    await makeProjectImage({ projectId: project.id, status: 'ready', isLive: true });
    await db
      .insert(schema.projectPendingVersion)
      .values({
        projectId: project.id,
        status: 'submitted',
        revision: 7,
        content: {
          project: { ...project, cityName: 'Private Draft City', description: 'unapproved words' },
          rooms: [],
          images: [],
        },
      });
    const [before] = await db.select().from(schema.projectPendingVersion);

    expect(await seedProjectLocations()).toEqual({ projects: 1, pendingVersions: 1, skipped: 0 });
    const [live] = await db.select().from(schema.project).where(eq(schema.project.id, project.id));
    const [pending] = await db.select().from(schema.projectPendingVersion);
    expect(live).toEqual({ ...project, citySlug: 'approved-city' });
    expect(pending).toEqual({
      ...before,
      content: {
        ...before!.content,
        project: { ...before!.content.project, citySlug: 'private-draft-city' },
      },
    });
    expect(await feedIds('approved-city')).toContain(project.id);
    expect(await feedIds('private-draft-city')).not.toContain(project.id);
    expect(await db.select().from(schema.searchProjectionOutbox)).toHaveLength(1);
  });

  it('preserves inactive city decisions, invalid names and deleted project content', async () => {
    const designer = await makeDesigner();
    await db
      .insert(schema.taxonomy)
      .values({ kind: 'city', label: 'Blocked City', slug: 'blocked-city', isActive: false });
    const blocked = await makeProject({
      designerId: designer.id,
      citySlug: null,
      cityName: 'Blocked City',
    });
    const invalid = await makeProject({ designerId: designer.id, citySlug: null, cityName: '!!' });
    const deleted = await makeProject({
      designerId: designer.id,
      status: 'deleted',
      citySlug: null,
      cityName: 'Deleted City',
    });
    expect(await seedProjectLocations()).toEqual({ projects: 0, pendingVersions: 0, skipped: 2 });
    for (const project of [blocked, invalid, deleted]) {
      expect(
        (await db.select().from(schema.project).where(eq(schema.project.id, project.id)))[0],
      ).toEqual(project);
    }
    expect(await db.select().from(schema.taxonomy)).toEqual([
      expect.objectContaining({ slug: 'blocked-city', isActive: false }),
    ]);
    expect(await db.select().from(schema.searchProjectionOutbox)).toHaveLength(0);
  });

  it('does not enqueue public indexing when only the private version needs classification', async () => {
    const designer = await makeDesigner({ status: 'active' });
    const project = await makeProject({
      designerId: designer.id,
      status: 'published',
      publishedAt: new Date(),
      citySlug: 'mumbai',
      cityName: null,
    });
    await db
      .insert(schema.projectPendingVersion)
      .values({
        projectId: project.id,
        revision: 2,
        content: {
          project: { ...project, citySlug: null, cityName: 'Pending Only City' },
          rooms: [],
          images: [],
        },
      });
    expect(await seedProjectLocations()).toEqual({ projects: 0, pendingVersions: 1, skipped: 0 });
    expect(
      (await db.select().from(schema.project).where(eq(schema.project.id, project.id)))[0],
    ).toEqual(project);
    expect(await db.select().from(schema.searchProjectionOutbox)).toHaveLength(0);
  });
});
