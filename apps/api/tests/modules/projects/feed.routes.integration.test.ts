import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import type { FeedProjectsResponse } from '@repo/contracts';
import { db, schema } from '@repo/db';
import { makeDesigner, makeProject, makeProjectImage, makeTaxonomy } from '@repo/db/testing';
import { app } from '../../../src/app.js';

/** Designers only surface in the feed when active — factory defaults to draft. */
const activeDesigner = (overrides: Partial<typeof schema.designerProfile.$inferInsert> = {}) =>
  makeDesigner({ status: 'active', ...overrides });

/** Seed the taxonomy terms a fully-tagged feed card needs (city + locality + budget + bhk + scope). */
async function seedFeedTaxonomy() {
  const city = await makeTaxonomy({ kind: 'city', slug: 'mumbai', label: 'Mumbai' });
  await makeTaxonomy({ kind: 'locality', slug: 'bandra', label: 'Bandra', parentId: city.id });
  await makeTaxonomy({ kind: 'budget_band', slug: '3-5-lakh', label: '₹3–5L' });
  await makeTaxonomy({ kind: 'bhk', slug: '2-bhk', label: '2 BHK' });
  await makeTaxonomy({ kind: 'scope', slug: 'full-home', label: 'Full Home' });
}

async function makePublishedProject(
  designerId: string,
  overrides: Partial<typeof schema.project.$inferInsert> = {},
) {
  return makeProject({
    designerId,
    status: 'published',
    citySlug: 'mumbai',
    localitySlug: 'bandra',
    budgetBandSlug: '3-5-lakh',
    bhkSlug: '2-bhk',
    scopeSlug: 'full-home',
    publishedAt: new Date(),
    ...overrides,
  });
}

async function attachReadyCover(projectId: string) {
  const cover = await makeProjectImage({
    projectId,
    status: 'ready',
    width: 480,
    height: 640,
    derivatives: [
      { variant: 'thumb', format: 'webp', key: `derivatives/${projectId}/thumb.webp`, width: 320, height: 240 },
    ],
  });
  await db.update(schema.project).set({ coverImageId: cover.id }).where(eq(schema.project.id, projectId));
  return cover;
}

async function getFeed(query = '') {
  const res = await app.request(`/api/projects/feed${query}`);
  return { res, body: (await res.json()) as FeedProjectsResponse };
}

describe('GET /api/projects/feed', () => {
  it('serves published projects with full card metadata to an unauthenticated caller', async () => {
    await seedFeedTaxonomy();
    const designer = await activeDesigner({
      displayName: 'Studio Noir',
      avgRating: '4.70',
      reviewCount: 12,
    });
    const project = await makePublishedProject(designer.id, { title: 'Industrial Chic Apartment' });
    await attachReadyCover(project.id);

    const { res, body } = await getFeed();

    // A 200 (not 401/400) proves the public /feed route resolves ahead of the authed GET /{id}.
    expect(res.status).toBe(200);
    expect(body.projects).toHaveLength(1);
    expect(body.projects[0]).toMatchObject({
      id: project.id,
      slug: project.slug,
      title: 'Industrial Chic Apartment',
      studio: 'Studio Noir',
      city: 'Mumbai',
      locality: 'Bandra',
      rating: 4.7,
      reviewCount: 12,
      budget: '₹3–5L',
      imageWidth: 480,
      imageHeight: 640,
    });
    expect(body.projects[0]?.tags).toEqual(expect.arrayContaining(['2 BHK', 'Full Home']));
    expect(body.projects[0]?.coverImageUrl).toContain('X-Amz-Signature=');
  });

  it('excludes projects that are not published', async () => {
    const designer = await activeDesigner();
    await makePublishedProject(designer.id, { title: 'Live One' });
    await makeProject({ designerId: designer.id, status: 'draft', title: 'Draft One' });
    await makeProject({ designerId: designer.id, status: 'submitted', title: 'Submitted One' });
    await makeProject({ designerId: designer.id, status: 'in_review', title: 'In Review One' });

    const { res, body } = await getFeed();

    expect(res.status).toBe(200);
    expect(body.projects.map((p) => p.title)).toEqual(['Live One']);
  });

  it('resolves an empty feed to 200 with no projects', async () => {
    const { res, body } = await getFeed();
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ projects: [], page: 1, limit: 12, hasMore: false });
  });

  it('paginates and reports hasMore', async () => {
    const designer = await activeDesigner();
    for (let i = 0; i < 3; i += 1) {
      await makePublishedProject(designer.id, { title: `Project ${i}` });
    }

    const first = await getFeed('?limit=2&page=1');
    expect(first.res.status).toBe(200);
    expect(first.body).toMatchObject({ page: 1, limit: 2, hasMore: true });
    expect(first.body.projects).toHaveLength(2);

    const second = await getFeed('?limit=2&page=2');
    expect(second.body).toMatchObject({ page: 2, limit: 2, hasMore: false });
    expect(second.body.projects).toHaveLength(1);
  });

  it('degrades cover image URL to null when the cover is not ready', async () => {
    const designer = await activeDesigner();
    const project = await makePublishedProject(designer.id, { title: 'No Cover Yet' });
    const cover = await makeProjectImage({ projectId: project.id, status: 'processing' });
    await db.update(schema.project).set({ coverImageId: cover.id }).where(eq(schema.project.id, project.id));

    const { body } = await getFeed();
    expect(body.projects[0]?.coverImageUrl).toBeNull();
  });

  it('excludes published projects belonging to a suspended designer', async () => {
    const active = await activeDesigner({ displayName: 'Active Studio' });
    const suspended = await makeDesigner({ status: 'suspended', displayName: 'Suspended Studio' });
    await makePublishedProject(active.id, { title: 'Visible' });
    await makePublishedProject(suspended.id, { title: 'Hidden' });

    const { body } = await getFeed();
    expect(body.projects.map((p) => p.title)).toEqual(['Visible']);
  });

  it('resolves a locality label scoped to its parent city, not another city sharing the slug', async () => {
    const mumbai = await makeTaxonomy({ kind: 'city', slug: 'mumbai', label: 'Mumbai' });
    const pune = await makeTaxonomy({ kind: 'city', slug: 'pune', label: 'Pune' });
    // Same locality slug under two different cities, with different labels.
    await makeTaxonomy({ kind: 'locality', slug: 'andheri', label: 'Andheri', parentId: mumbai.id });
    await makeTaxonomy({ kind: 'locality', slug: 'andheri', label: 'Andheri West', parentId: pune.id });

    const designer = await activeDesigner();
    await makePublishedProject(designer.id, {
      title: 'Pune Home',
      citySlug: 'pune',
      localitySlug: 'andheri',
      budgetBandSlug: null,
      bhkSlug: null,
      scopeSlug: null,
    });

    const { body } = await getFeed();
    expect(body.projects[0]).toMatchObject({ city: 'Pune', locality: 'Andheri West' });
  });
});
