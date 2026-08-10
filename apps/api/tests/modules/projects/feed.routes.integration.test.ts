import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  publicImageDetailResponseSchema,
  type FeedProjectsResponse,
  type PublicImageDetailResponse,
} from '@repo/contracts';
import { db, schema } from '@repo/db';
import {
  makeDesigner,
  makeProject,
  makeProjectImage,
  makeProjectRoom,
  makeTaxonomy,
} from '@repo/db/testing';
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

async function attachReadyCover(
  projectId: string,
  overrides: Partial<typeof schema.projectImage.$inferInsert> = {},
) {
  const cover = await makeProjectImage({
    projectId,
    status: 'ready',
    width: 480,
    height: 640,
    derivatives: [
      {
        variant: 'thumb',
        format: 'webp',
        key: `derivatives/${projectId}/thumb.webp`,
        width: 320,
        height: 240,
      },
    ],
    ...overrides,
  });
  await db
    .update(schema.project)
    .set({ coverImageId: cover.id })
    .where(eq(schema.project.id, projectId));
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

  it('filters by room using the real Postgres query', async () => {
    const livingRoom = await makeTaxonomy({
      kind: 'room',
      slug: 'living-room',
      label: 'Living Room',
    });
    const designer = await activeDesigner();
    const matching = await makePublishedProject(designer.id, { title: 'Living Room Project' });
    await makePublishedProject(designer.id, { title: 'Bedroom Project' });
    await makeProjectRoom({ projectId: matching.id, roomTypeId: livingRoom.id });

    const { res, body } = await getFeed('?roomSlugs=living-room');

    expect(res.status).toBe(200);
    expect(body.projects.map((project) => project.title)).toEqual(['Living Room Project']);
  });

  it('filters by ready-image theme using the real Postgres query', async () => {
    const designer = await activeDesigner();
    const matching = await makePublishedProject(designer.id, { title: 'Warm Project' });
    const nonMatching = await makePublishedProject(designer.id, { title: 'Cool Project' });
    await makeProjectImage({ projectId: matching.id, status: 'ready', themeSlugs: ['warm'] });
    await makeProjectImage({
      projectId: nonMatching.id,
      status: 'ready',
      themeSlugs: ['minimalist'],
    });
    await makeProjectImage({
      projectId: nonMatching.id,
      status: 'processing',
      themeSlugs: ['warm'],
    });

    const { res, body } = await getFeed('?themes=warm');

    expect(res.status).toBe(200);
    expect(body.projects.map((project) => project.title)).toEqual(['Warm Project']);
  });

  it('combines different facets with AND semantics', async () => {
    const designer = await activeDesigner();
    await makePublishedProject(designer.id, {
      title: 'Mumbai 2 BHK',
      citySlug: 'mumbai',
      bhkSlug: '2-bhk',
    });
    await makePublishedProject(designer.id, {
      title: 'Mumbai 3 BHK',
      citySlug: 'mumbai',
      bhkSlug: '3-bhk',
    });

    const { res, body } = await getFeed('?citySlug=mumbai&bhkSlug=2-bhk');

    expect(res.status).toBe(200);
    expect(body.projects.map((project) => project.title)).toEqual(['Mumbai 2 BHK']);
  });

  it('returns an empty successful page for an unknown taxonomy slug', async () => {
    const designer = await activeDesigner();
    await makePublishedProject(designer.id, { title: 'Known Project' });

    const { res, body } = await getFeed('?citySlug=unknown-city');

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ projects: [], hasMore: false });
  });

  it('rejects malformed taxonomy slugs at the public endpoint boundary', async () => {
    const { res } = await getFeed('?citySlug=Mumbai!');

    expect(res.status).toBe(422);
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
    await db
      .update(schema.project)
      .set({ coverImageId: cover.id })
      .where(eq(schema.project.id, project.id));

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
    await makeTaxonomy({
      kind: 'locality',
      slug: 'andheri',
      label: 'Andheri',
      parentId: mumbai.id,
    });
    await makeTaxonomy({
      kind: 'locality',
      slug: 'andheri',
      label: 'Andheri West',
      parentId: pune.id,
    });

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

/**
 * Composition and visibility for the two correlated `EXISTS` filters — `roomSlugs` joins
 * project_room → taxonomy, `themes` tests jsonb containment on ready images. Both are
 * shared with the discovery feed via `projectFeedFilterClauses`, and neither is
 * expressible against a mocked Drizzle builder, so they are pinned against the real DB.
 */
describe('GET /api/projects/feed — filter composition', () => {
  const tagThemes = (projectId: string, themes: string[]) =>
    makeProjectImage({ projectId, status: 'ready', themeSlugs: themes });

  it('ORs multiple values inside one facet', async () => {
    const designer = await activeDesigner();
    const warm = await makePublishedProject(designer.id, { title: 'Warm' });
    await tagThemes(warm.id, ['warm']);
    const minimal = await makePublishedProject(designer.id, { title: 'Minimal' });
    await tagThemes(minimal.id, ['minimal']);
    const coastal = await makePublishedProject(designer.id, { title: 'Coastal' });
    await tagThemes(coastal.id, ['coastal']);

    const { body } = await getFeed('?themes=warm&themes=minimal');

    expect(body.projects.map((p) => p.title).sort()).toEqual(['Minimal', 'Warm']);
  });

  it('ANDs one EXISTS facet against the other and against a column facet', async () => {
    const designer = await activeDesigner();
    const kitchen = await makeTaxonomy({ kind: 'room', slug: 'kitchen', label: 'Kitchen' });

    const both = await makePublishedProject(designer.id, {
      title: 'Warm Kitchen',
      bhkSlug: '2-bhk',
    });
    await tagThemes(both.id, ['warm']);
    await makeProjectRoom({ projectId: both.id, roomTypeId: kitchen.id });

    const themeOnly = await makePublishedProject(designer.id, { title: 'Warm No Kitchen' });
    await tagThemes(themeOnly.id, ['warm']);

    const roomOnly = await makePublishedProject(designer.id, { title: 'Kitchen Not Warm' });
    await tagThemes(roomOnly.id, ['minimal']);
    await makeProjectRoom({ projectId: roomOnly.id, roomTypeId: kitchen.id });

    const paired = await getFeed('?themes=warm&roomSlugs=kitchen');
    expect(paired.body.projects.map((p) => p.title)).toEqual(['Warm Kitchen']);

    const narrowed = await getFeed('?themes=warm&roomSlugs=kitchen&bhkSlug=2-bhk');
    expect(narrowed.body.projects.map((p) => p.title)).toEqual(['Warm Kitchen']);

    const mismatched = await getFeed('?themes=warm&roomSlugs=kitchen&bhkSlug=4-bhk');
    expect(mismatched.body.projects).toEqual([]);
  });

  it('never surfaces an unpublished project or a suspended designer through a filter', async () => {
    const active = await activeDesigner({ displayName: 'Active Studio' });
    const suspended = await makeDesigner({ status: 'suspended', displayName: 'Suspended Studio' });
    const kitchen = await makeTaxonomy({ kind: 'room', slug: 'kitchen', label: 'Kitchen' });

    const visible = await makePublishedProject(active.id, { title: 'Visible' });
    await tagThemes(visible.id, ['warm']);
    await makeProjectRoom({ projectId: visible.id, roomTypeId: kitchen.id });

    // Identically tagged, but a draft: the filter must not resurrect it.
    const draft = await makeProject({
      designerId: active.id,
      status: 'draft',
      title: 'Draft Warm',
    });
    await tagThemes(draft.id, ['warm']);
    await makeProjectRoom({ projectId: draft.id, roomTypeId: kitchen.id });

    // Identically tagged and published, but the studio is suspended.
    const hidden = await makePublishedProject(suspended.id, { title: 'Suspended Warm' });
    await tagThemes(hidden.id, ['warm']);
    await makeProjectRoom({ projectId: hidden.id, roomTypeId: kitchen.id });

    expect((await getFeed('?themes=warm')).body.projects.map((p) => p.title)).toEqual(['Visible']);
    expect((await getFeed('?roomSlugs=kitchen')).body.projects.map((p) => p.title)).toEqual([
      'Visible',
    ]);
  });

  it('returns a matching project once even when several of its rooms or images match', async () => {
    const designer = await activeDesigner();
    const kitchen = await makeTaxonomy({ kind: 'room', slug: 'kitchen', label: 'Kitchen' });
    const project = await makePublishedProject(designer.id, { title: 'Two Kitchens' });
    await makeProjectRoom({ projectId: project.id, roomTypeId: kitchen.id, name: 'Kitchen 1' });
    await makeProjectRoom({ projectId: project.id, roomTypeId: kitchen.id, name: 'Kitchen 2' });
    await tagThemes(project.id, ['warm']);
    await tagThemes(project.id, ['warm']);

    expect((await getFeed('?roomSlugs=kitchen')).body.projects).toHaveLength(1);
    expect((await getFeed('?themes=warm')).body.projects).toHaveLength(1);
  });

  it('resolves an unknown room or theme slug to an empty feed rather than an error', async () => {
    const designer = await activeDesigner();
    const project = await makePublishedProject(designer.id, { title: 'Warm' });
    await tagThemes(project.id, ['warm']);

    for (const query of ['?themes=no-such-theme', '?roomSlugs=no-such-room']) {
      const { res, body } = await getFeed(query);
      expect(res.status).toBe(200);
      expect(body.projects).toEqual([]);
    }
  });
});

describe('GET /api/projects/images/:imageId', () => {
  it('serves a public image detail payload for a ready image in a published project', async () => {
    await seedFeedTaxonomy();
    const designer = await activeDesigner({
      displayName: 'Studio Public',
      avgRating: '4.80',
      reviewCount: 7,
    });
    const project = await makePublishedProject(designer.id, {
      title: 'Public Image Project',
      description: 'A truthful project description.',
    });
    const cover = await attachReadyCover(project.id, { sortOrder: 1 });
    const activeImage = await makeProjectImage({
      projectId: project.id,
      status: 'ready',
      sortOrder: 0,
      originalKey: `private/${project.id}/active-original.jpg`,
      width: 1200,
      height: 800,
      derivatives: [
        {
          variant: 'large',
          format: 'webp',
          key: `derivatives/${project.id}/active-large.webp`,
          width: 1200,
          height: 800,
        },
      ],
    });

    const res = await app.request(`/api/projects/images/${activeImage.id}`);
    const body = (await res.json()) as PublicImageDetailResponse;

    expect(res.status).toBe(200);
    expect(publicImageDetailResponseSchema.safeParse(body).success).toBe(true);
    expect(body.activeImageId).toBe(activeImage.id);
    expect(body.project).toMatchObject({
      id: project.id,
      coverImageId: cover.id,
      title: 'Public Image Project',
      description: 'A truthful project description.',
      studio: 'Studio Public',
    });
    expect(body.activeImage).toMatchObject({
      id: activeImage.id,
      sortOrder: activeImage.sortOrder,
    });
    expect(body.designer).toMatchObject({
      id: designer.id,
      displayName: 'Studio Public',
      reviewCount: 7,
    });
    expect(body.recommendations).toEqual({
      moreFromDesigner: [],
      sameBudgetDifferentStyle: [],
      nearby: [],
    });
    expect(body.images.map((image) => image.id)).toEqual([activeImage.id, cover.id]);
    const payload = JSON.stringify(body);
    expect(payload).not.toContain(activeImage.originalKey);
    expect(payload).not.toContain(cover.originalKey);
  });

  it('returns 404 for non-ready images, unpublished projects, and inactive designers', async () => {
    const active = await activeDesigner();
    const draftProject = await makeProject({ designerId: active.id, status: 'draft' });
    const draftImage = await makeProjectImage({ projectId: draftProject.id, status: 'ready' });

    const publishedProject = await makePublishedProject(active.id);
    const processingImage = await makeProjectImage({
      projectId: publishedProject.id,
      status: 'processing',
    });

    const suspended = await makeDesigner({ status: 'suspended' });
    const suspendedProject = await makePublishedProject(suspended.id);
    const suspendedImage = await makeProjectImage({
      projectId: suspendedProject.id,
      status: 'ready',
    });

    for (const imageId of [draftImage.id, processingImage.id, suspendedImage.id]) {
      const response = await app.request(`/api/projects/images/${imageId}`);
      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: 'not_found' },
      });
    }
  });
});
