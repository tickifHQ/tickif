import { describe, it, expect } from 'vitest';
import { testClient } from 'hono/testing';
import { eq } from 'drizzle-orm';
import type {
  ErrorResponse,
  ListProjectRoomsResponse,
  ListProjectsResponse,
  PortfolioProjectsResponse,
  ProjectCompletenessResponse,
  ProjectDetailResponse,
  PublicProjectBySlugResponse,
  ProjectRoom,
  ProjectReviewCommentsResponse,
} from '@repo/contracts';
import { publicProjectBySlugResponseSchema } from '@repo/contracts';
import { db, schema } from '@repo/db';
import {
  makeDesigner,
  makeOrganization,
  makeProject,
  makeProjectImage,
  makeProjectReviewComment,
  makeProjectRoom,
  makeReview,
  makeSubscription,
  makeTaxonomy,
  makeTeam,
} from '@repo/db/testing';
import { app } from '../../../src/app.js';
import { activateOrganization, createRoleSession } from '../../helpers/auth.js';

const client = testClient(app);

async function makeDesignerSession(phoneNumber = '+919800002001') {
  const { cookie, userId } = await createRoleSession(phoneNumber, 'designer');
  const designer = await makeDesigner({ userId });
  await db.insert(schema.member).values({
    id: `mem-${userId}`,
    organizationId: designer.orgId,
    userId,
    role: 'owner',
    createdAt: new Date(),
  });
  const activeCookie = await activateOrganization(cookie, designer.orgId);
  return { cookie: activeCookie, userId, designer };
}

async function requestJson(
  path: string,
  method: string,
  cookie: string | undefined,
  body: unknown,
) {
  return app.request(path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe('GET /api/projects', () => {
  it('rejects unauthenticated project listing requests', async () => {
    const res = await client.api.projects.$get({ query: {} });
    expect(res.status).toBe(401);
  });

  it('does not guess an organization for a multi-org project listing', async () => {
    const { cookie, userId } = await createRoleSession('+919800002046', 'designer');
    const designer = await makeDesigner({ userId });
    await db.insert(schema.member).values({
      id: `mem-no-active-${userId}`,
      organizationId: designer.orgId,
      userId,
      role: 'owner',
      createdAt: new Date(),
    });
    const secondOrganization = await makeOrganization();
    await db.insert(schema.member).values({
      id: `mem-no-active-second-${userId}`,
      organizationId: secondOrganization.id,
      userId,
      role: 'owner',
      createdAt: new Date(),
    });

    const res = await client.api.projects.$get({ query: {} }, { headers: { cookie } });

    expect(res.status).toBe(422);
  });

  it('returns an org-scoped project page with dashboard list fields', async () => {
    const { cookie, designer } = await makeDesignerSession('+919800002030');
    await makeProject({
      designerId: designer.id,
      title: 'Bandra Apartment',
      status: 'published',
      propertyTypeSlug: 'residential',
      citySlug: 'mumbai',
      localitySlug: 'bandra',
    });
    const draftProject = await makeProject({
      designerId: designer.id,
      title: 'Andheri Apartment',
      status: 'draft',
      propertySubtypeSlug: 'apartment',
      citySlug: 'mumbai',
      localitySlug: 'andheri',
    });
    const coverImage = await makeProjectImage({
      projectId: draftProject.id,
      status: 'ready',
      derivatives: [
        {
          variant: 'thumb',
          format: 'webp',
          key: 'derivatives/project/cover/thumb.webp',
          width: 320,
          height: 240,
        },
      ],
    });
    await db
      .update(schema.project)
      .set({ coverImageId: coverImage.id })
      .where(eq(schema.project.id, draftProject.id));
    await makeProject({ title: 'Other Org Project', status: 'published' });

    const res = await client.api.projects.$get(
      { query: { sort: 'title' } },
      { headers: { cookie } },
    );
    expect(res.status).toBe(200);

    const body = (await res.json()) as ListProjectsResponse;
    expect(body).toMatchObject({ total: 2, page: 1, limit: 12, totalPages: 1 });
    expect(body.items.map((item) => item.title)).toEqual(['Andheri Apartment', 'Bandra Apartment']);
    expect(body.items[0]).toMatchObject({
      propertyType: 'apartment',
      city: 'mumbai',
      locality: 'andheri',
    });
    expect(body.items[0]?.coverImageUrl).toContain('X-Amz-Signature=');
  });

  it('surfaces unresolved requested changes only on the owned changes-requested project', async () => {
    const { cookie, designer } = await makeDesignerSession('+919800002053');
    const project = await makeProject({
      designerId: designer.id,
      title: 'Needs updates',
      status: 'changes_requested',
    });
    const unresolved = await makeProjectReviewComment({
      projectId: project.id,
      body: 'Add a wider kitchen photo.',
    });
    await makeProjectReviewComment({
      projectId: project.id,
      body: 'Use a clearer room label.',
      status: 'resolved',
    });

    const list = await app.request('/api/projects?status=draft', {
      headers: { cookie },
    });
    expect(list.status).toBe(200);
    expect((await list.json()) as ListProjectsResponse).toMatchObject({
      items: [
        {
          id: project.id,
          reviewComments: [
            {
              id: unresolved.id,
              authorLabel: 'Tickif Review Team',
              status: 'unresolved',
            },
          ],
        },
      ],
    });

    const detail = await app.request(`/api/projects/${project.id}`, {
      headers: { cookie },
    });
    expect(detail.status).toBe(200);
    expect((await detail.json()) as ProjectDetailResponse).toMatchObject({
      id: project.id,
      reviewComments: [{ id: unresolved.id, status: 'unresolved' }],
    });

    const comments = await app.request(`/api/projects/${project.id}/review-comments`, {
      headers: { cookie },
    });
    expect(comments.status).toBe(200);
    expect((await comments.json()) as ProjectReviewCommentsResponse).toMatchObject({
      items: [
        { id: unresolved.id, status: 'unresolved' },
        { body: 'Use a clearer room label.', status: 'resolved' },
      ],
    });
  });

  it('maps dashboard status buckets and applies search and pagination', async () => {
    const { cookie, designer } = await makeDesignerSession('+919800002031');
    await makeProject({
      designerId: designer.id,
      title: 'Bandra Draft',
      status: 'draft',
      localitySlug: 'bandra',
    });
    await makeProject({
      designerId: designer.id,
      title: 'Bandra Changes',
      status: 'changes_requested',
      localitySlug: 'bandra',
    });
    await makeProject({
      designerId: designer.id,
      title: 'Bandra Submitted',
      status: 'submitted',
      localitySlug: 'bandra',
    });
    await makeProject({
      designerId: designer.id,
      title: 'Bandra Rejected',
      status: 'rejected',
      localitySlug: 'bandra',
      moderationNote: 'Portfolio mismatch.',
      rejectionReasonCode: 'portfolio-mismatch',
    });

    const draft = await client.api.projects.$get(
      { query: { status: 'draft', q: 'bandra', page: 1, limit: 1, sort: 'title' } },
      { headers: { cookie } },
    );
    expect(draft.status).toBe(200);
    const draftBody = (await draft.json()) as ListProjectsResponse;
    expect(draftBody).toMatchObject({ total: 3, page: 1, limit: 1, totalPages: 3 });
    expect(draftBody.items[0]?.status).toBe('changes_requested');

    const review = await client.api.projects.$get(
      { query: { status: 'in_review' } },
      { headers: { cookie } },
    );
    expect(review.status).toBe(200);
    const reviewBody = (await review.json()) as ListProjectsResponse;
    expect(reviewBody.total).toBe(1);
    expect(reviewBody.items[0]?.status).toBe('submitted');
  });

  it('treats LIKE metacharacters in search as literal text', async () => {
    const { cookie, designer } = await makeDesignerSession('+919800002039');
    await makeProject({
      designerId: designer.id,
      title: '100% Modular Kitchen',
      slug: '100-percent-modular-kitchen',
      status: 'published',
    });
    await makeProject({
      designerId: designer.id,
      title: '100X Modular Kitchen',
      slug: '100x-modular-kitchen',
      status: 'published',
    });

    const res = await client.api.projects.$get(
      { query: { q: '100%', sort: 'title' } },
      { headers: { cookie } },
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as ListProjectsResponse;
    expect(body.items.map((item) => item.title)).toEqual(['100% Modular Kitchen']);
  });
});

describe('GET /api/projects/slug/{slug}', () => {
  it('returns the display-ready public project model without private or original media fields', async () => {
    const city = await makeTaxonomy({ kind: 'city', slug: 'mumbai', label: 'Mumbai' });
    await makeTaxonomy({
      kind: 'locality',
      slug: 'bandra',
      label: 'Bandra',
      parentId: city.id,
    });
    await Promise.all([
      makeTaxonomy({ kind: 'property_type', slug: 'residential', label: 'Residential' }),
      makeTaxonomy({ kind: 'property_subtype', slug: 'apartment', label: 'Apartment' }),
      makeTaxonomy({ kind: 'scope', slug: 'full-home', label: 'Full Home' }),
      makeTaxonomy({ kind: 'bhk', slug: '3-bhk', label: '3 BHK' }),
      makeTaxonomy({ kind: 'budget_band', slug: 'premium', label: 'Premium' }),
      makeTaxonomy({ kind: 'theme', slug: 'contemporary', label: 'Contemporary' }),
      makeTaxonomy({ kind: 'material', slug: 'wood', label: 'Wood' }),
      makeTaxonomy({ kind: 'finish', slug: 'matte', label: 'Matte' }),
    ]);
    const roomType = await makeTaxonomy({
      kind: 'room',
      slug: 'living-room',
      label: 'Living Room',
    });
    const designer = await makeDesigner({
      status: 'active',
      displayName: 'Studio A',
      entityType: 'company',
      bio: 'Residential interior design studio.',
      firmType: 'Interior design studio',
      foundedYear: 2018,
      yearsExperience: 8,
    });
    await db.insert(schema.designerProfileFootprint).values({
      profileId: designer.id,
      taxonomyId: city.id,
    });
    const project = await makeProject({
      designerId: designer.id,
      slug: 'sunlit-bandra-apartment',
      title: 'Sunlit Bandra Apartment',
      description: 'A warm contemporary apartment.',
      status: 'published',
      propertyTypeSlug: 'residential',
      propertySubtypeSlug: 'apartment',
      scopeSlug: 'full-home',
      bhkSlug: '3-bhk',
      sizeSqft: 1800,
      citySlug: 'mumbai',
      localitySlug: 'bandra',
      budgetBandSlug: 'premium',
      completedMonth: '2025-06',
      publishedAt: new Date('2025-07-01T00:00:00.000Z'),
    });
    const room = await makeProjectRoom({
      projectId: project.id,
      roomTypeId: roomType.id,
      name: 'Living Room',
      sortOrder: 0,
    });
    const image = await makeProjectImage({
      projectId: project.id,
      roomId: room.id,
      status: 'ready',
      sortOrder: 0,
      originalKey: 'originals/private/living-room.jpg',
      derivatives: [
        {
          variant: 'large',
          format: 'webp',
          key: 'derivatives/public/living-room-large.webp',
          width: 1600,
          height: 1200,
        },
        {
          variant: 'thumb',
          format: 'webp',
          key: 'derivatives/public/living-room-thumb.webp',
          width: 400,
          height: 300,
        },
      ],
      width: 1600,
      height: 1200,
      themeSlugs: ['contemporary'],
      materialSlugs: ['wood'],
      finishSlugs: ['matte'],
      tagSlugs: ['warm-tones'],
    });
    const processingImage = await makeProjectImage({
      projectId: project.id,
      roomId: room.id,
      status: 'processing',
      sortOrder: 1,
      originalKey: 'originals/private/processing.jpg',
      themeSlugs: ['contemporary'],
    });
    await db
      .update(schema.project)
      .set({ coverImageId: image.id })
      .where(eq(schema.project.id, project.id));
    await makeReview({
      designerProfileId: designer.id,
      projectId: project.id,
      status: 'published',
      rating: 5,
      body: 'The team understood how we wanted the completed home to feel.',
      createdAt: new Date('2025-07-01T00:00:00.000Z'),
      updatedAt: new Date('2025-07-02T00:00:00.000Z'),
      publishedAt: new Date('2025-07-02T00:00:00.000Z'),
      moderatedAt: new Date('2025-07-02T00:00:00.000Z'),
    });
    const recommendedProject = await makeProject({
      designerId: designer.id,
      title: 'Bandra Courtyard Home',
      status: 'published',
      propertySubtypeSlug: 'apartment',
      bhkSlug: '3-bhk',
      citySlug: 'mumbai',
      localitySlug: 'bandra',
      budgetBandSlug: 'premium',
      completedMonth: '2024-11',
      publishedAt: new Date('2025-06-01T00:00:00.000Z'),
    });
    const recommendedCover = await makeProjectImage({
      projectId: recommendedProject.id,
      status: 'ready',
      themeSlugs: ['contemporary'],
      derivatives: [
        {
          variant: 'thumb',
          format: 'webp',
          key: 'derivatives/public/courtyard-thumb.webp',
          width: 400,
          height: 300,
        },
      ],
      width: 400,
      height: 300,
    });
    await db
      .update(schema.project)
      .set({ coverImageId: recommendedCover.id })
      .where(eq(schema.project.id, recommendedProject.id));

    // More than one SQL page of newer projects share the source theme. The
    // different-style candidate must still be found because theme exclusion is
    // applied before the per-group limit.
    const otherDesigner = await makeDesigner({ status: 'active', displayName: 'Studio B' });
    for (let index = 0; index < 13; index += 1) {
      const overlappingProject = await makeProject({
        designerId: otherDesigner.id,
        title: `Contemporary Premium ${index}`,
        status: 'published',
        budgetBandSlug: 'premium',
        citySlug: 'delhi',
        publishedAt: new Date(`2025-08-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`),
      });
      const overlappingCover = await makeProjectImage({
        projectId: overlappingProject.id,
        status: 'ready',
        themeSlugs: ['contemporary'],
        derivatives: [
          {
            variant: 'thumb',
            format: 'webp',
            key: `derivatives/public/overlap-${index}.webp`,
            width: 400,
            height: 300,
          },
        ],
      });
      await db
        .update(schema.project)
        .set({ coverImageId: overlappingCover.id })
        .where(eq(schema.project.id, overlappingProject.id));
    }
    const differentStyleProject = await makeProject({
      designerId: otherDesigner.id,
      title: 'Classic Premium Home',
      status: 'published',
      budgetBandSlug: 'premium',
      citySlug: 'delhi',
      publishedAt: new Date('2025-05-01T00:00:00.000Z'),
    });
    const differentStyleCover = await makeProjectImage({
      projectId: differentStyleProject.id,
      status: 'ready',
      themeSlugs: ['traditional'],
      derivatives: [
        {
          variant: 'thumb',
          format: 'webp',
          key: 'derivatives/public/classic-premium.webp',
          width: 400,
          height: 300,
        },
      ],
    });
    await db
      .update(schema.project)
      .set({ coverImageId: differentStyleCover.id })
      .where(eq(schema.project.id, differentStyleProject.id));

    const response = await app.request('/api/projects/slug/sunlit-bandra-apartment');

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe(
      'public, max-age=60, stale-while-revalidate=300',
    );
    const body = (await response.json()) as PublicProjectBySlugResponse;
    expect(publicProjectBySlugResponseSchema.safeParse(body).success).toBe(true);
    expect(body).toMatchObject({
      id: project.id,
      specifications: {
        propertyType: { slug: 'residential', label: 'Residential' },
        locality: { slug: 'bandra', label: 'Bandra' },
      },
      rooms: [
        {
          id: room.id,
          roomType: { slug: 'living-room', label: 'Living Room' },
          photoCount: 1,
        },
      ],
      images: [
        {
          id: image.id,
          roomId: room.id,
          themes: [{ slug: 'contemporary', label: 'Contemporary' }],
          materials: [{ slug: 'wood', label: 'Wood' }],
          finishes: [{ slug: 'matte', label: 'Matte' }],
          tags: [{ slug: 'warm-tones', label: 'Warm Tones' }],
        },
      ],
      designer: {
        displayName: 'Studio A',
        entityType: 'company',
        projectCount: 2,
        footprintCities: [{ slug: 'mumbai', label: 'Mumbai' }],
      },
      narrative: { rating: 5 },
      recurringMotifs: expect.arrayContaining([
        { kind: 'theme', slug: 'contemporary', label: 'Contemporary', projectCount: 2 },
      ]),
      recommendations: {
        moreFromDesigner: [{ id: recommendedProject.id, completionYear: 2024 }],
        sameBudgetDifferentStyle: [{ id: differentStyleProject.id }],
      },
    });
    expect(body.images[0]?.url).toContain('living-room-large.webp');
    expect(body.images).toHaveLength(1);
    expect(body.images.some((item) => item.id === processingImage.id)).toBe(false);
    expect(JSON.stringify(body)).not.toContain('originals/private');

    const idResponse = await app.request(`/api/projects/public/${project.id}`);
    expect(idResponse.status).toBe(200);
    expect(idResponse.headers.get('cache-control')).toBe(
      'public, max-age=60, stale-while-revalidate=300',
    );
    const idBody = (await idResponse.json()) as PublicProjectBySlugResponse;
    expect(publicProjectBySlugResponseSchema.safeParse(idBody).success).toBe(true);
    expect(idBody).toMatchObject({
      id: project.id,
      slug: project.slug,
      rooms: [{ id: room.id, photoCount: 1 }],
      images: [{ id: image.id, roomId: room.id }],
      designer: { id: designer.id, displayName: 'Studio A' },
    });
    expect(JSON.stringify(idBody)).not.toContain('originals/private');

    await db
      .update(schema.taxonomy)
      .set({ isActive: false })
      .where(eq(schema.taxonomy.id, roomType.id));
    const retiredRoomTypeResponse = await app.request('/api/projects/slug/sunlit-bandra-apartment');
    const retiredRoomTypeBody =
      (await retiredRoomTypeResponse.json()) as PublicProjectBySlugResponse;
    expect(retiredRoomTypeBody.rooms).toEqual([
      expect.objectContaining({ id: room.id, roomType: null, photoCount: 1 }),
    ]);
  });

  it('fills every recommendation group from real SQL and hides unpublished or inactive-designer projects', async () => {
    await Promise.all([
      makeTaxonomy({ kind: 'city', slug: 'mumbai', label: 'Mumbai' }),
      makeTaxonomy({ kind: 'city', slug: 'delhi', label: 'Delhi' }),
      makeTaxonomy({ kind: 'budget_band', slug: 'premium', label: 'Premium' }),
      makeTaxonomy({ kind: 'budget_band', slug: 'value', label: 'Value' }),
      makeTaxonomy({ kind: 'theme', slug: 'contemporary', label: 'Contemporary' }),
      makeTaxonomy({ kind: 'theme', slug: 'traditional', label: 'Traditional' }),
    ]);

    /** Project with a `ready` cover carrying `themeSlugs`, wired up as the cover. */
    async function makeCoveredProject(
      overrides: Parameters<typeof makeProject>[0],
      themeSlugs: string[],
    ) {
      const created = await makeProject(overrides);
      const cover = await makeProjectImage({
        projectId: created.id,
        status: 'ready',
        themeSlugs,
        derivatives: [
          {
            variant: 'thumb',
            format: 'webp',
            key: `derivatives/public/${created.id}-thumb.webp`,
            width: 400,
            height: 300,
          },
        ],
        width: 400,
        height: 300,
      });
      await db
        .update(schema.project)
        .set({ coverImageId: cover.id })
        .where(eq(schema.project.id, created.id));
      return created;
    }

    // Source project: fully tagged (budget band + one theme), which is the shape
    // that builds all three recommendation branches.
    const designer = await makeDesigner({ status: 'active', displayName: 'Studio Source' });
    const project = await makeCoveredProject(
      {
        designerId: designer.id,
        slug: 'recommendation-source',
        title: 'Recommendation Source',
        status: 'published',
        citySlug: 'mumbai',
        budgetBandSlug: 'premium',
        publishedAt: new Date('2025-07-01T00:00:00.000Z'),
      },
      ['contemporary'],
    );

    // One expected hit per group.
    const sameDesigner = await makeCoveredProject(
      {
        designerId: designer.id,
        title: 'Studio Source Second Home',
        status: 'published',
        citySlug: 'mumbai',
        budgetBandSlug: 'premium',
        publishedAt: new Date('2025-06-01T00:00:00.000Z'),
      },
      ['traditional'],
    );
    const otherStudio = await makeDesigner({ status: 'active', displayName: 'Studio Other' });
    const differentStyle = await makeCoveredProject(
      {
        designerId: otherStudio.id,
        title: 'Traditional Premium Home',
        status: 'published',
        citySlug: 'delhi',
        budgetBandSlug: 'premium',
        publishedAt: new Date('2025-05-01T00:00:00.000Z'),
      },
      ['traditional'],
    );
    const nearbyStudio = await makeDesigner({ status: 'active', displayName: 'Studio Nearby' });
    const nearby = await makeCoveredProject(
      {
        designerId: nearbyStudio.id,
        title: 'Nearby Value Home',
        status: 'published',
        citySlug: 'mumbai',
        budgetBandSlug: 'value',
        publishedAt: new Date('2025-04-01T00:00:00.000Z'),
      },
      ['traditional'],
    );

    // A same-budget project that shares the source theme must be filtered out of
    // sameBudgetDifferentStyle (and it is in another city, so no nearby fallback).
    const sharedStyle = await makeCoveredProject(
      {
        designerId: otherStudio.id,
        title: 'Contemporary Premium Home',
        status: 'published',
        citySlug: 'delhi',
        budgetBandSlug: 'premium',
        publishedAt: new Date('2025-08-01T00:00:00.000Z'),
      },
      ['contemporary'],
    );

    // Decoys: each would match a branch on taxonomy alone, so only the
    // status/designer-status guards can keep them out.
    const draftSameDesigner = await makeCoveredProject(
      {
        designerId: designer.id,
        title: 'Studio Source Draft',
        status: 'draft',
        citySlug: 'mumbai',
        budgetBandSlug: 'premium',
      },
      ['traditional'],
    );
    const submittedSameDesigner = await makeCoveredProject(
      {
        designerId: designer.id,
        title: 'Studio Source Submitted',
        status: 'submitted',
        citySlug: 'mumbai',
        budgetBandSlug: 'premium',
      },
      ['traditional'],
    );
    const suspendedDesigner = await makeDesigner({
      status: 'suspended',
      displayName: 'Studio Suspended',
    });
    const suspendedDesignerProject = await makeCoveredProject(
      {
        designerId: suspendedDesigner.id,
        title: 'Suspended Studio Home',
        status: 'published',
        citySlug: 'mumbai',
        budgetBandSlug: 'premium',
      },
      ['traditional'],
    );
    const draftDesigner = await makeDesigner({ status: 'draft', displayName: 'Studio Unlisted' });
    const draftDesignerProject = await makeCoveredProject(
      {
        designerId: draftDesigner.id,
        title: 'Unlisted Studio Home',
        status: 'published',
        citySlug: 'mumbai',
        budgetBandSlug: 'premium',
      },
      ['traditional'],
    );

    const response = await app.request('/api/projects/slug/recommendation-source');

    expect(response.status).toBe(200);
    const body = (await response.json()) as PublicProjectBySlugResponse;
    expect(publicProjectBySlugResponseSchema.safeParse(body).success).toBe(true);
    expect(body.recommendations.moreFromDesigner.map((item) => item.id)).toEqual([sameDesigner.id]);
    expect(body.recommendations.sameBudgetDifferentStyle.map((item) => item.id)).toEqual([
      differentStyle.id,
    ]);
    expect(body.recommendations.nearby.map((item) => item.id)).toEqual([nearby.id]);
    // No `completedMonth` on these, so the year can only come from `publishedAt` —
    // which the raw recommendation query has to hand back as a real Date.
    expect(body.recommendations.moreFromDesigner[0]?.completionYear).toBe(2025);
    expect(body.recommendations.nearby[0]?.completionYear).toBe(2025);

    const recommendedIds = [
      ...body.recommendations.moreFromDesigner,
      ...body.recommendations.sameBudgetDifferentStyle,
      ...body.recommendations.nearby,
    ].map((item) => item.id);
    expect(recommendedIds).not.toContain(project.id);
    expect(recommendedIds).not.toContain(sharedStyle.id);
    expect(recommendedIds).not.toContain(draftSameDesigner.id);
    expect(recommendedIds).not.toContain(submittedSameDesigner.id);
    expect(recommendedIds).not.toContain(suspendedDesignerProject.id);
    expect(recommendedIds).not.toContain(draftDesignerProject.id);

    // Positive control: the decoys above are eligible on every other axis, so
    // clearing just the status guards has to surface them. Keeps the negative
    // assertions from passing for an unrelated reason.
    await db
      .update(schema.project)
      .set({ status: 'published' })
      .where(eq(schema.project.id, draftSameDesigner.id));
    await db
      .update(schema.designerProfile)
      .set({ status: 'active' })
      .where(eq(schema.designerProfile.id, suspendedDesigner.id));

    const relaxed = await app.request('/api/projects/slug/recommendation-source');
    expect(relaxed.status).toBe(200);
    const relaxedBody = (await relaxed.json()) as PublicProjectBySlugResponse;
    expect(relaxedBody.recommendations.moreFromDesigner.map((item) => item.id)).toEqual([
      sameDesigner.id,
      draftSameDesigner.id,
    ]);
    expect(relaxedBody.recommendations.sameBudgetDifferentStyle.map((item) => item.id)).toEqual([
      differentStyle.id,
      suspendedDesignerProject.id,
    ]);
  });

  it('returns 404 for an unpublished project slug', async () => {
    const designer = await makeDesigner({ status: 'active' });
    await makeProject({ designerId: designer.id, slug: 'private-draft', status: 'draft' });

    const response = await app.request('/api/projects/slug/private-draft');

    expect(response.status).toBe(404);
  });
});

describe('GET /api/projects/portfolio', () => {
  it('rejects unauthenticated portfolio requests', async () => {
    const res = await client.api.projects.portfolio.$get({ query: {} });
    expect(res.status).toBe(401);
  });

  it('returns status-grouped summaries, counts, and representative cover media', async () => {
    const { cookie, designer } = await makeDesignerSession('+919800002042');
    await makeProject({ designerId: designer.id, title: 'Draft', status: 'draft' });
    const changesProject = await makeProject({
      designerId: designer.id,
      title: 'Changes Requested',
      status: 'changes_requested',
    });
    await makeProject({ designerId: designer.id, title: 'Submitted', status: 'submitted' });
    await makeProject({ designerId: designer.id, title: 'In Review', status: 'in_review' });
    await makeProject({ designerId: designer.id, title: 'Published', status: 'published' });
    await makeProject({ designerId: designer.id, title: 'Rejected', status: 'rejected' });
    await makeProject({ title: 'Other Org Project', status: 'changes_requested' });
    const coverImage = await makeProjectImage({
      projectId: changesProject.id,
      status: 'ready',
      width: 1600,
      height: 1200,
      derivatives: [
        {
          variant: 'thumb',
          format: 'webp',
          key: 'derivatives/project/portfolio/thumb.webp',
          width: 320,
          height: 240,
        },
      ],
    });
    await db
      .update(schema.project)
      .set({ coverImageId: coverImage.id })
      .where(eq(schema.project.id, changesProject.id));

    const res = await client.api.projects.portfolio.$get(
      { query: { status: 'changes_requested', sort: 'title' } },
      { headers: { cookie } },
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as PortfolioProjectsResponse;
    expect(body).toMatchObject({
      total: 1,
      page: 1,
      limit: 12,
      totalPages: 1,
      statusCounts: {
        total: 6,
        draft: 1,
        inReview: 2,
        published: 1,
        changesRequested: 1,
        rejected: 1,
        archived: 0,
        delisted: 0,
        deleted: 0,
      },
    });
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({
      id: changesProject.id,
      status: 'changes_requested',
      statusGroup: 'changes_requested',
      coverImage: { id: coverImage.id, width: 320, height: 240 },
    });
    expect(body.items[0]?.coverImage?.url).toBe(body.items[0]?.coverImageUrl);
    expect(body.items[0]?.coverImageUrl).toContain('X-Amz-Signature=');

    const reviewRes = await client.api.projects.portfolio.$get(
      { query: { status: 'in_review', sort: 'title' } },
      { headers: { cookie } },
    );
    expect(reviewRes.status).toBe(200);
    const reviewBody = (await reviewRes.json()) as PortfolioProjectsResponse;
    expect(reviewBody.items.map((item) => [item.title, item.statusGroup])).toEqual([
      ['In Review', 'in_review'],
      ['Submitted', 'in_review'],
    ]);

    const draftRes = await client.api.projects.portfolio.$get(
      { query: { status: 'draft' } },
      { headers: { cookie } },
    );
    expect(draftRes.status).toBe(200);
    const draftBody = (await draftRes.json()) as PortfolioProjectsResponse;
    expect(draftBody.items.map((item) => item.title)).toEqual(['Draft']);
  });

  it('rejects banned users on portfolio reads', async () => {
    const { cookie, userId, designer } = await makeDesignerSession('+919800002046');
    await makeProject({ designerId: designer.id, title: 'Banned Draft', status: 'draft' });
    await db.update(schema.user).set({ banned: true }).where(eq(schema.user.id, userId));
    const freshCookie = cookie
      .split('; ')
      .filter((value) => !value.startsWith('better-auth.session_data'))
      .join('; ');

    const res = await client.api.projects.portfolio.$get(
      { query: {} },
      { headers: { cookie: freshCookie } },
    );

    expect(res.status).toBe(403);
  });

  it('paginates portfolio pages past the first with stable ordering', async () => {
    const { cookie, designer } = await makeDesignerSession('+919800002047');
    await makeProject({ designerId: designer.id, title: 'Alpha', status: 'draft' });
    await makeProject({ designerId: designer.id, title: 'Beta', status: 'published' });
    await makeProject({ designerId: designer.id, title: 'Gamma', status: 'rejected' });

    const res = await client.api.projects.portfolio.$get(
      { query: { page: 2, limit: 1, sort: 'title' } },
      { headers: { cookie } },
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as PortfolioProjectsResponse;
    expect(body).toMatchObject({ page: 2, limit: 1, total: 3, totalPages: 3 });
    expect(body.items.map((item) => item.title)).toEqual(['Beta']);
    expect(body.statusCounts).toEqual({
      total: 3,
      draft: 1,
      inReview: 0,
      published: 1,
      changesRequested: 0,
      rejected: 1,
      archived: 0,
      delisted: 0,
      deleted: 0,
    });
  });

  it('returns the complete empty portfolio shape', async () => {
    const { cookie } = await makeDesignerSession('+919800002043');

    const res = await client.api.projects.portfolio.$get({ query: {} }, { headers: { cookie } });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      items: [],
      statusCounts: {
        total: 0,
        draft: 0,
        inReview: 0,
        published: 0,
        changesRequested: 0,
        rejected: 0,
        archived: 0,
        delisted: 0,
        deleted: 0,
      },
      page: 1,
      total: 0,
      limit: 12,
      totalPages: 0,
    });
  });

  it('scopes projects and counts to the active organization', async () => {
    const { cookie, userId, designer } = await makeDesignerSession('+919800002044');
    const secondOrg = await makeOrganization({ name: 'Second Studio' });
    await db.insert(schema.member).values({
      id: `mem-second-${userId}`,
      organizationId: secondOrg.id,
      userId,
      role: 'owner',
      createdAt: new Date(),
    });
    const secondTeam = await makeTeam({ organizationId: secondOrg.id });
    await db.insert(schema.teamMember).values({
      id: `tm-second-${userId}`,
      teamId: secondTeam.id,
      userId,
      createdAt: new Date(),
    });
    const [secondDesigner] = await db
      .insert(schema.designerProfile)
      .values({
        orgId: secondOrg.id,
        teamId: secondTeam.id,
        slug: `second-studio-${userId}`,
        displayName: 'Second Studio',
      })
      .returning();
    await makeProject({ designerId: designer.id, title: 'First Org Draft', status: 'draft' });
    await makeProject({
      designerId: secondDesigner!.id,
      title: 'Second Org Published',
      status: 'published',
    });
    const secondOrgCookie = await activateOrganization(cookie, secondOrg.id);

    const res = await client.api.projects.portfolio.$get(
      { query: {} },
      { headers: { cookie: secondOrgCookie } },
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as PortfolioProjectsResponse;
    expect(body.items.map((item) => item.title)).toEqual(['Second Org Published']);
    expect(body.statusCounts).toEqual({
      total: 1,
      draft: 0,
      inReview: 0,
      published: 1,
      changesRequested: 0,
      rejected: 0,
      archived: 0,
      delisted: 0,
      deleted: 0,
    });
  });
});

describe('POST /api/projects', () => {
  it('rejects unauthenticated requests with 401', async () => {
    const res = await client.api.projects.$post({
      json: { title: 'New Project' },
    });
    expect(res.status).toBe(401);
  });

  it('creates the project in the selected organization for a multi-org designer', async () => {
    const { cookie, userId } = await makeDesignerSession('+919800002047');
    const selectedDesigner = await makeDesigner();
    await db.insert(schema.member).values({
      id: `mem-selected-${userId}`,
      organizationId: selectedDesigner.orgId,
      userId,
      role: 'owner',
      createdAt: new Date(),
    });
    await db.insert(schema.teamMember).values({
      id: `tm-selected-${userId}`,
      teamId: selectedDesigner.teamId,
      userId,
      createdAt: new Date(),
    });
    const selectedCookie = await activateOrganization(cookie, selectedDesigner.orgId);

    const res = await client.api.projects.$post(
      { json: { title: 'Selected Studio Project' } },
      { headers: { cookie: selectedCookie } },
    );

    expect(res.status).toBe(201);
    const body = (await res.json()) as ProjectDetailResponse;
    expect(body.designerId).toBe(selectedDesigner.id);
  });

  it('creates a project for the authenticated user designer profile (201)', async () => {
    const { cookie, designer } = await makeDesignerSession('+919800002002');

    const res = await client.api.projects.$post(
      { json: { title: 'Authenticated Project' } },
      { headers: { cookie } },
    );

    expect(res.status).toBe(201);
    if (res.status !== 201) throw new Error('expected 201'); // narrows the union
    const body = await res.json();
    expect(body).toMatchObject({
      designerId: designer.id,
      title: 'Authenticated Project',
      status: 'draft',
      rooms: [],
    });
    expect(body.slug).toBe('authenticated-project');
  });

  it('generates a title and pre-fills apartment rooms from project metadata', async () => {
    const { cookie, designer } = await makeDesignerSession('+919800002020');
    await makeTaxonomy({ kind: 'city', slug: 'bengaluru', label: 'Bengaluru' });
    await makeTaxonomy({ kind: 'property_type', slug: 'residential', label: 'Residential' });
    await makeTaxonomy({
      kind: 'property_subtype',
      slug: 'apartment',
      label: 'Apartment / flat',
      metadata: {
        propertyTypeSlug: 'residential',
        defaultRoomSlugs: ['kitchen', 'bedroom', 'bathroom'],
      },
    });
    await makeTaxonomy({ kind: 'bhk', slug: '2-bhk', label: '2 BHK' });
    await makeTaxonomy({ kind: 'budget_band', slug: 'luxury', label: 'Luxury' });
    await makeTaxonomy({ kind: 'room', slug: 'kitchen', label: 'Kitchen' });
    await makeTaxonomy({ kind: 'room', slug: 'bedroom', label: 'Bedroom' });
    await makeTaxonomy({ kind: 'room', slug: 'bathroom', label: 'Bathroom' });

    const res = await client.api.projects.$post(
      {
        json: {
          buildingName: 'Maitri Apartments',
          propertyTypeSlug: 'residential',
          propertySubtypeSlug: 'apartment',
          bhkSlug: '2-bhk',
          citySlug: 'bengaluru',
          budgetBandSlug: 'luxury',
        },
      },
      { headers: { cookie } },
    );

    expect(res.status).toBe(201);
    if (res.status !== 201) throw new Error('expected 201');
    const body = await res.json();
    expect(body).toMatchObject({
      designerId: designer.id,
      title: 'Maitri Apartments - 2 BHK Luxury Apartment / flat in Bengaluru',
      slug: 'maitri-apartments-2-bhk-luxury-apartment-flat-in-bengaluru',
      propertySubtypeSlug: 'apartment',
    });
    expect(body.rooms.map((room) => room.name)).toEqual([
      'Kitchen',
      'Master Bedroom',
      'Bedroom 2',
      'Bathroom',
    ]);
  });
});

describe('Project draft CRUD + rooms (E-102)', () => {
  it('updates draft metadata and sets a same-project cover image', async () => {
    const { cookie, designer } = await makeDesignerSession('+919800002003');
    const project = await makeProject({ designerId: designer.id, status: 'draft' });
    const image = await makeProjectImage({ projectId: project.id });
    const city = await makeTaxonomy({ kind: 'city', slug: 'mumbai', label: 'Mumbai' });
    await makeTaxonomy({ kind: 'locality', slug: 'bandra', label: 'Bandra', parentId: city.id });
    await makeTaxonomy({ kind: 'property_type', slug: 'residential', label: 'Residential' });
    await makeTaxonomy({
      kind: 'property_subtype',
      slug: 'apartment',
      label: 'Apartment',
      metadata: { propertyTypeSlug: 'residential' },
    });
    await makeTaxonomy({ kind: 'scope', slug: 'full-home', label: 'Full Home' });
    await makeTaxonomy({ kind: 'bhk', slug: '3-bhk', label: '3 BHK' });
    await makeTaxonomy({ kind: 'budget_band', slug: 'premium', label: 'Premium' });

    const res = await requestJson(`/api/projects/${project.id}`, 'PATCH', cookie, {
      title: 'Updated Draft',
      propertyTypeSlug: 'residential',
      propertySubtypeSlug: 'apartment',
      scopeSlug: 'full-home',
      bhkSlug: '3-bhk',
      sizeSqft: 1800,
      citySlug: 'mumbai',
      localitySlug: 'bandra',
      buildingName: 'Sea View',
      budgetBandSlug: 'premium',
      completedMonth: '2026-05',
      durationMonths: 7,
      coverImageId: image.id,
      metadata: { source: 'draft-builder' },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      id: project.id,
      title: 'Updated Draft',
      propertyTypeSlug: 'residential',
      propertySubtypeSlug: 'apartment',
      scopeSlug: 'full-home',
      bhkSlug: '3-bhk',
      sizeSqft: 1800,
      citySlug: 'mumbai',
      localitySlug: 'bandra',
      buildingName: 'Sea View',
      budgetBandSlug: 'premium',
      completedMonth: '2026-05',
      durationMonths: 7,
      coverImageId: image.id,
    });
  });

  it('rejects a cover image from another project', async () => {
    const { cookie, designer } = await makeDesignerSession('+919800002004');
    const project = await makeProject({ designerId: designer.id, status: 'draft' });
    const otherImage = await makeProjectImage();

    const res = await requestJson(`/api/projects/${project.id}`, 'PATCH', cookie, {
      coverImageId: otherImage.id,
    });

    expect(res.status).toBe(422);
  });

  it('creates, reorders, updates, lists, and deletes rooms owned by the caller', async () => {
    const { cookie, designer } = await makeDesignerSession('+919800002005');
    const project = await makeProject({ designerId: designer.id, status: 'draft' });
    const living = await makeTaxonomy({ kind: 'room', slug: 'living-room', label: 'Living Room' });
    const kitchen = await makeTaxonomy({ kind: 'room', slug: 'kitchen', label: 'Kitchen' });

    const createLiving = await requestJson(`/api/projects/${project.id}/rooms`, 'POST', cookie, {
      roomTypeId: living.id,
      name: 'Living Room',
      sortOrder: 1,
      metadata: { labels: ['airy'] },
    });
    expect(createLiving.status).toBe(201);
    const livingRoom = (await createLiving.json()) as ProjectRoom;

    const createKitchen = await requestJson(`/api/projects/${project.id}/rooms`, 'POST', cookie, {
      roomTypeId: kitchen.id,
      name: 'Kitchen',
      sortOrder: 0,
    });
    expect(createKitchen.status).toBe(201);
    const kitchenRoom = (await createKitchen.json()) as ProjectRoom;

    const reorder = await requestJson(
      `/api/projects/${project.id}/rooms/reorder`,
      'PATCH',
      cookie,
      {
        rooms: [
          { id: livingRoom.id, sortOrder: 0 },
          { id: kitchenRoom.id, sortOrder: 1 },
        ],
      },
    );
    expect(reorder.status).toBe(200);

    const update = await requestJson(
      `/api/projects/${project.id}/rooms/${livingRoom.id}`,
      'PATCH',
      cookie,
      { name: 'Formal Living Room', description: null },
    );
    expect(update.status).toBe(200);
    expect(await update.json()).toMatchObject({ name: 'Formal Living Room' });

    const list = await app.request(`/api/projects/${project.id}/rooms`, {
      headers: { cookie },
    });
    expect(list.status).toBe(200);
    const listed = (await list.json()) as ListProjectRoomsResponse;
    expect(listed.items.map((room) => room.id)).toEqual([livingRoom.id, kitchenRoom.id]);

    const del = await app.request(`/api/projects/${project.id}/rooms/${kitchenRoom.id}`, {
      method: 'DELETE',
      headers: { cookie },
    });
    expect(del.status).toBe(200);
  });

  it('rejects non-room taxonomy terms when creating rooms', async () => {
    const { cookie, designer } = await makeDesignerSession('+919800002014');
    const project = await makeProject({ designerId: designer.id, status: 'draft' });
    const city = await makeTaxonomy({ kind: 'city', slug: 'mumbai', label: 'Mumbai' });

    const res = await requestJson(`/api/projects/${project.id}/rooms`, 'POST', cookie, {
      roomTypeId: city.id,
      name: 'Living Room',
    });

    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toBe('Invalid roomTypeId');
  });

  it('links a project image to a same-project room', async () => {
    const { cookie, designer } = await makeDesignerSession('+919800002006');
    const project = await makeProject({ designerId: designer.id, status: 'draft' });
    const room = await makeProjectRoom({ projectId: project.id });
    const image = await makeProjectImage({ projectId: project.id });

    const res = await requestJson(
      `/api/projects/${project.id}/images/${image.id}`,
      'PATCH',
      cookie,
      {
        roomId: room.id,
        sortOrder: 3,
      },
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      id: image.id,
      projectId: project.id,
      roomId: room.id,
      sortOrder: 3,
    });
  });

  it('rejects linking an image to a room from another project', async () => {
    const { cookie, designer } = await makeDesignerSession('+919800002015');
    const project = await makeProject({ designerId: designer.id, status: 'draft' });
    const image = await makeProjectImage({ projectId: project.id });
    const otherProject = await makeProject({ designerId: designer.id, status: 'draft' });
    const otherRoom = await makeProjectRoom({ projectId: otherProject.id });

    const res = await requestJson(
      `/api/projects/${project.id}/images/${image.id}`,
      'PATCH',
      cookie,
      {
        roomId: otherRoom.id,
      },
    );

    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toBe('Room must belong to the project');
  });

  it('deletes an owned draft project image and clears it as cover', async () => {
    const { cookie, designer } = await makeDesignerSession('+919800002035');
    const project = await makeProject({ designerId: designer.id, status: 'draft' });
    const image = await makeProjectImage({ projectId: project.id });
    await db
      .update(schema.project)
      .set({ coverImageId: image.id })
      .where(eq(schema.project.id, project.id));

    const res = await app.request(`/api/projects/${project.id}/images/${image.id}`, {
      method: 'DELETE',
      headers: { cookie },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: image.id, deleted: true });

    const [imageRows, [projectRow]] = await Promise.all([
      db.select().from(schema.projectImage).where(eq(schema.projectImage.id, image.id)),
      db.select().from(schema.project).where(eq(schema.project.id, project.id)),
    ]);
    expect(imageRows).toHaveLength(0);
    expect(projectRow?.coverImageId).toBeNull();
  });

  it('marks owned drafts deleted while retaining project data for the owner audit view', async () => {
    const { cookie, designer } = await makeDesignerSession('+919800002016');
    const project = await makeProject({ designerId: designer.id, status: 'draft' });
    await makeProjectRoom({ projectId: project.id });
    await makeProjectImage({ projectId: project.id });

    const res = await app.request(`/api/projects/${project.id}`, {
      method: 'DELETE',
      headers: { cookie },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: project.id, deleted: true });

    const [projectRows, roomRows, imageRows] = await Promise.all([
      db.select().from(schema.project).where(eq(schema.project.id, project.id)),
      db.select().from(schema.projectRoom).where(eq(schema.projectRoom.projectId, project.id)),
      db.select().from(schema.projectImage).where(eq(schema.projectImage.projectId, project.id)),
    ]);
    expect(projectRows).toEqual([expect.objectContaining({ id: project.id, status: 'deleted' })]);
    expect(roomRows).toHaveLength(1);
    expect(imageRows).toHaveLength(1);
  });

  it('archives a published project, removes it from public reads, and restores it as a draft', async () => {
    const { cookie, designer } = await makeDesignerSession('+919800002060');
    await db
      .update(schema.designerProfile)
      .set({ projectCount: 1 })
      .where(eq(schema.designerProfile.id, designer.id));
    const project = await makeProject({
      designerId: designer.id,
      status: 'published',
      publishedAt: new Date('2026-08-01T00:00:00.000Z'),
    });
    await makeProjectRoom({ projectId: project.id });

    const archive = await app.request(`/api/projects/${project.id}/archive`, {
      method: 'POST',
      headers: { cookie },
    });
    expect(archive.status).toBe(200);
    expect(await archive.json()).toMatchObject({ id: project.id, status: 'archived' });

    const [[archivedProject], [archivedDesigner], searchEvents] = await Promise.all([
      db.select().from(schema.project).where(eq(schema.project.id, project.id)),
      db.select().from(schema.designerProfile).where(eq(schema.designerProfile.id, designer.id)),
      db
        .select()
        .from(schema.searchProjectionOutbox)
        .where(eq(schema.searchProjectionOutbox.entityId, project.id)),
    ]);
    expect(archivedProject?.status).toBe('archived');
    expect(archivedDesigner?.projectCount).toBe(0);
    expect(searchEvents).toEqual([
      expect.objectContaining({ entityKind: 'project', operation: 'delete' }),
    ]);

    const publicRead = await app.request(`/api/projects/public/${project.id}`);
    expect(publicRead.status).toBe(404);
    const archivedList = await app.request('/api/projects?status=archived', {
      headers: { cookie },
    });
    expect(archivedList.status).toBe(200);
    expect((await archivedList.json()) as ListProjectsResponse).toMatchObject({
      items: [{ id: project.id, status: 'archived' }],
    });

    const restore = await app.request(`/api/projects/${project.id}/restore`, {
      method: 'POST',
      headers: { cookie },
    });
    expect(restore.status).toBe(200);
    expect(await restore.json()).toMatchObject({ id: project.id, status: 'draft' });
    expect(
      await db
        .select()
        .from(schema.projectRoom)
        .where(eq(schema.projectRoom.projectId, project.id)),
    ).toHaveLength(1);
  });

  it('allows Corporate Members to archive but not delete projects', async () => {
    const { designer } = await makeDesignerSession('+919800002061');
    const member = await createRoleSession('+919800002062', 'designer');
    await db.insert(schema.member).values({
      id: `mem-${member.userId}`,
      organizationId: designer.orgId,
      userId: member.userId,
      role: 'member',
      createdAt: new Date(),
    });
    await makeSubscription({
      organizationId: designer.orgId,
      planTier: 'corporate',
      subscriptionState: 'active',
    });
    const memberCookie = await activateOrganization(member.cookie, designer.orgId);
    const project = await makeProject({ designerId: designer.id, status: 'published' });

    const archive = await app.request(`/api/projects/${project.id}/archive`, {
      method: 'POST',
      headers: { cookie: memberCookie },
    });
    expect(archive.status).toBe(200);

    const deletion = await app.request(`/api/projects/${project.id}`, {
      method: 'DELETE',
      headers: { cookie: memberCookie },
    });
    expect(deletion.status).toBe(403);
  });

  it('duplicates an owned project into a fresh draft with rooms and image metadata', async () => {
    const { cookie, designer } = await makeDesignerSession('+919800002032');
    const project = await makeProject({
      designerId: designer.id,
      title: 'Original Project',
      slug: 'original-project',
      status: 'published',
      propertyTypeSlug: 'residential',
      citySlug: 'mumbai',
    });
    const room = await makeProjectRoom({
      projectId: project.id,
      name: 'Living Room',
      sortOrder: 2,
      metadata: { labels: ['Main'] },
    });
    const image = await makeProjectImage({
      projectId: project.id,
      roomId: room.id,
      originalKey: 'orig/source.jpg',
      contentType: 'image/jpeg',
      derivatives: [
        { variant: 'thumb', format: 'webp', key: 'thumb/source.webp', width: 320, height: 240 },
      ],
      themeSlugs: ['modern'],
      materialSlugs: ['wood'],
      finishSlugs: ['matte'],
      tagSlugs: ['warm'],
      width: 1600,
      height: 1200,
      phash: 'abc123',
      status: 'ready',
      sortOrder: 4,
    });
    await db
      .update(schema.project)
      .set({ coverImageId: image.id })
      .where(eq(schema.project.id, project.id));

    const res = await app.request(`/api/projects/${project.id}/duplicate`, {
      method: 'POST',
      headers: { cookie },
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as { project: ProjectDetailResponse };
    expect(body.project).toMatchObject({
      title: 'Original Project Copy',
      status: 'draft',
      propertyTypeSlug: 'residential',
      citySlug: 'mumbai',
    });
    expect(body.project.id).not.toBe(project.id);
    expect(body.project.slug).not.toBe(project.slug);
    expect(body.project.submittedAt).toBeNull();
    expect(body.project.publishedAt).toBeNull();
    expect(body.project.rooms).toHaveLength(1);
    expect(body.project.rooms[0]).toMatchObject({
      name: 'Living Room',
      sortOrder: 2,
      metadata: { labels: ['Main'] },
    });

    const copiedImages = await db
      .select()
      .from(schema.projectImage)
      .where(eq(schema.projectImage.projectId, body.project.id));
    expect(copiedImages).toHaveLength(1);
    expect(copiedImages[0]).toMatchObject({
      roomId: body.project.rooms[0]?.id,
      originalKey: 'orig/source.jpg',
      contentType: 'image/jpeg',
      themeSlugs: ['modern'],
      materialSlugs: ['wood'],
      finishSlugs: ['matte'],
      tagSlugs: ['warm'],
      status: 'ready',
      sortOrder: 4,
    });
    expect(body.project.coverImageId).toBe(copiedImages[0]?.id);
  });

  it('rejects unauthenticated duplicate requests', async () => {
    const { designer } = await makeDesignerSession('+919800002033');
    const project = await makeProject({ designerId: designer.id, status: 'published' });

    const res = await app.request(`/api/projects/${project.id}/duplicate`, {
      method: 'POST',
    });

    expect(res.status).toBe(401);
  });

  it('forbids cross-organization duplicate requests', async () => {
    const { designer } = await makeDesignerSession('+919800002034');
    const stranger = await makeDesignerSession('+919800002035');
    const project = await makeProject({ designerId: designer.id, status: 'published' });

    const res = await app.request(`/api/projects/${project.id}/duplicate`, {
      method: 'POST',
      headers: { cookie: stranger.cookie },
    });

    expect(res.status).toBe(403);
  });

  it('forbids same-organization non-owners from duplicating a project', async () => {
    const { designer } = await makeDesignerSession('+919800002036');
    const sameOrgMember = await createRoleSession('+919800002037', 'visitor');
    await db.insert(schema.member).values({
      id: `mem-${sameOrgMember.userId}`,
      organizationId: designer.orgId,
      userId: sameOrgMember.userId,
      role: 'member',
      createdAt: new Date(),
    });
    await db.insert(schema.teamMember).values({
      id: `team-mem-${sameOrgMember.userId}`,
      teamId: designer.teamId,
      userId: sameOrgMember.userId,
      createdAt: new Date(),
    });
    const project = await makeProject({ designerId: designer.id, status: 'published' });

    const res = await app.request(`/api/projects/${project.id}/duplicate`, {
      method: 'POST',
      headers: { cookie: sameOrgMember.cookie },
    });

    expect(res.status).toBe(403);
  });

  it('returns 404 when duplicating a missing project', async () => {
    const { cookie } = await makeDesignerSession('+919800002038');

    const res = await app.request('/api/projects/11111111-1111-4111-8111-111111111111/duplicate', {
      method: 'POST',
      headers: { cookie },
    });

    expect(res.status).toBe(404);
  });

  it('allows a superadmin to update a draft they do not own', async () => {
    const { designer } = await makeDesignerSession('+919800002017');
    const superadmin = await createRoleSession('+919800002018', 'superadmin');
    const project = await makeProject({ designerId: designer.id, status: 'draft' });

    const res = await requestJson(`/api/projects/${project.id}`, 'PATCH', superadmin.cookie, {
      title: 'Curated by Admin',
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: project.id, title: 'Curated by Admin' });
  });

  it('rejects unknown city and budget taxonomy slugs on create', async () => {
    const { cookie } = await makeDesignerSession('+919800002019');

    const badCity = await requestJson('/api/projects', 'POST', cookie, {
      title: 'Bad City',
      citySlug: 'atlantis',
    });
    expect(badCity.status).toBe(422);

    const badBudget = await requestJson('/api/projects', 'POST', cookie, {
      title: 'Bad Budget',
      budgetBandSlug: 'gazillion',
    });
    expect(badBudget.status).toBe(422);
  });

  it('forbids non-owners from mutating another designer project', async () => {
    const { designer } = await makeDesignerSession('+919800002007');
    const stranger = await makeDesignerSession('+919800002008');
    const project = await makeProject({ designerId: designer.id, status: 'draft' });

    const res = await requestJson(`/api/projects/${project.id}`, 'PATCH', stranger.cookie, {
      title: 'Nope',
    });

    expect(res.status).toBe(403);
  });

  it('forbids same-organization members from mutating an owner draft', async () => {
    const { designer } = await makeDesignerSession('+919800002011');
    const sameOrgMember = await createRoleSession('+919800002012', 'visitor');
    await db.insert(schema.member).values({
      id: `mem-${sameOrgMember.userId}`,
      organizationId: designer.orgId,
      userId: sameOrgMember.userId,
      role: 'member',
      createdAt: new Date(),
    });
    await db.insert(schema.teamMember).values({
      id: `team-mem-${sameOrgMember.userId}`,
      teamId: designer.teamId,
      userId: sameOrgMember.userId,
      createdAt: new Date(),
    });
    const project = await makeProject({ designerId: designer.id, status: 'draft' });

    const res = await requestJson(`/api/projects/${project.id}`, 'PATCH', sameOrgMember.cookie, {
      title: 'Nope',
    });

    expect(res.status).toBe(403);
  });

  it('does not mutate published projects through draft routes', async () => {
    const { cookie, designer } = await makeDesignerSession('+919800002009');
    const project = await makeProject({ designerId: designer.id, status: 'published' });

    const res = await requestJson(`/api/projects/${project.id}`, 'PATCH', cookie, {
      title: 'Nope',
    });

    expect(res.status).toBe(409);
  });

  it('allows changes-requested projects to be edited', async () => {
    const { cookie, designer } = await makeDesignerSession('+919800002022');
    const project = await makeProject({ designerId: designer.id, status: 'changes_requested' });

    const res = await requestJson(`/api/projects/${project.id}`, 'PATCH', cookie, {
      title: 'Updated After Review',
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      id: project.id,
      title: 'Updated After Review',
      status: 'changes_requested',
    });
  });

  it('rejects banned users on draft owner reads', async () => {
    const { cookie, designer, userId } = await makeDesignerSession('+919800002010');
    const project = await makeProject({ designerId: designer.id, status: 'draft' });
    await db.update(schema.user).set({ banned: true }).where(eq(schema.user.id, userId));
    const freshCookie = cookie
      .split('; ')
      .filter((c) => !c.startsWith('better-auth.session_data'))
      .join('; ');

    const res = await app.request(`/api/projects/${project.id}`, {
      headers: { cookie: freshCookie },
    });

    expect(res.status).toBe(403);
  });

  it('allows banned users to read published projects through the public route', async () => {
    const { cookie, designer, userId } = await makeDesignerSession('+919800002013');
    const project = await makeProject({ designerId: designer.id, status: 'published' });
    await db.update(schema.user).set({ banned: true }).where(eq(schema.user.id, userId));

    const res = await app.request(`/api/projects/${project.id}`, {
      headers: { cookie },
    });

    expect(res.status).toBe(200);
  });

  it('reports completeness and submits complete draft projects', async () => {
    const { cookie, designer } = await makeDesignerSession('+919800002014');
    const project = await makeProject({
      designerId: designer.id,
      status: 'draft',
      citySlug: 'mumbai',
      propertyTypeSlug: 'residential',
      scopeSlug: 'full-home',
      budgetBandSlug: 'premium',
    });
    const room = await makeProjectRoom({ projectId: project.id });
    await makeProjectImage({
      projectId: project.id,
      roomId: room.id,
      status: 'ready',
      themeSlugs: ['modern'],
      finishSlugs: ['veneer'],
    });
    await makeProjectImage({
      projectId: project.id,
      roomId: room.id,
      status: 'ready',
      themeSlugs: ['modern'],
      finishSlugs: ['veneer'],
    });
    await makeProjectImage({
      projectId: project.id,
      roomId: room.id,
      status: 'ready',
      themeSlugs: ['modern'],
      finishSlugs: ['veneer'],
    });

    const completeness = await app.request(`/api/projects/${project.id}/completeness`, {
      headers: { cookie },
    });
    expect(completeness.status).toBe(200);
    expect(await completeness.json()).toMatchObject({ complete: true, missing: [] });

    const submit = await app.request(`/api/projects/${project.id}/submit`, {
      method: 'POST',
      headers: { cookie },
    });
    expect(submit.status).toBe(200);
    const body = (await submit.json()) as ProjectDetailResponse;
    expect(body).toMatchObject({ id: project.id, status: 'submitted' });
    expect(body.submittedAt).toEqual(expect.any(String));

    const events = await db
      .select()
      .from(schema.projectModerationEvent)
      .where(eq(schema.projectModerationEvent.projectId, project.id));
    expect(events).toEqual([
      expect.objectContaining({
        action: 'submit',
        fromStatus: 'draft',
        toStatus: 'submitted',
      }),
    ]);
  });

  it('counts linked processing images as complete so upload processing can finish in the background', async () => {
    const { cookie, designer } = await makeDesignerSession('+919800002044');
    const project = await makeProject({
      designerId: designer.id,
      status: 'draft',
      citySlug: 'mumbai',
      propertyTypeSlug: 'residential',
      scopeSlug: 'full-home',
      budgetBandSlug: 'premium',
    });
    const room = await makeProjectRoom({ projectId: project.id });
    for (let index = 0; index < 3; index += 1) {
      await makeProjectImage({
        projectId: project.id,
        roomId: room.id,
        status: 'processing',
        sortOrder: index,
        themeSlugs: ['modern'],
        finishSlugs: ['veneer'],
      });
    }
    await makeProjectImage({
      projectId: project.id,
      roomId: room.id,
      status: 'failed',
      themeSlugs: ['modern'],
      finishSlugs: ['veneer'],
    });
    await makeProjectImage({ projectId: project.id, status: 'processing' });

    const completeness = await app.request(`/api/projects/${project.id}/completeness`, {
      headers: { cookie },
    });
    expect(completeness.status).toBe(200);
    const completenessBody = (await completeness.json()) as ProjectCompletenessResponse;
    expect(completenessBody).toMatchObject({ complete: true, missing: [] });
    expect(
      completenessBody.requirements.find(
        (requirement) => requirement.key === 'at-least-three-photos',
      ),
    ).toMatchObject({ label: 'At least 3 photos', complete: true });

    const submit = await app.request(`/api/projects/${project.id}/submit`, {
      method: 'POST',
      headers: { cookie },
    });
    expect(submit.status).toBe(200);
    const body = (await submit.json()) as ProjectDetailResponse;
    expect(body).toMatchObject({ id: project.id, status: 'submitted' });
  });

  it('does not count stale processing images as complete', async () => {
    const { cookie, designer } = await makeDesignerSession('+919800002045');
    const project = await makeProject({
      designerId: designer.id,
      status: 'draft',
      citySlug: 'mumbai',
      propertyTypeSlug: 'residential',
      scopeSlug: 'full-home',
      budgetBandSlug: 'premium',
    });
    const room = await makeProjectRoom({ projectId: project.id });
    const staleUpdatedAt = new Date(Date.now() - 31 * 60 * 1000);
    for (let index = 0; index < 3; index += 1) {
      await makeProjectImage({
        projectId: project.id,
        roomId: room.id,
        status: 'processing',
        sortOrder: index,
        themeSlugs: ['modern'],
        finishSlugs: ['veneer'],
        updatedAt: staleUpdatedAt,
      });
    }

    const completeness = await app.request(`/api/projects/${project.id}/completeness`, {
      headers: { cookie },
    });
    expect(completeness.status).toBe(200);
    const completenessBody = (await completeness.json()) as ProjectCompletenessResponse;
    expect(completenessBody).toMatchObject({
      complete: false,
      missing: expect.arrayContaining(['at-least-three-photos']),
    });

    const submit = await app.request(`/api/projects/${project.id}/submit`, {
      method: 'POST',
      headers: { cookie },
    });
    expect(submit.status).toBe(422);
  });

  it('resubmits complete changes-requested projects', async () => {
    const { cookie, designer } = await makeDesignerSession('+919800002023');
    const project = await makeProject({
      designerId: designer.id,
      status: 'changes_requested',
      citySlug: 'mumbai',
      propertyTypeSlug: 'residential',
      scopeSlug: 'full-home',
      budgetBandSlug: 'premium',
    });
    const room = await makeProjectRoom({ projectId: project.id });
    await makeProjectImage({
      projectId: project.id,
      roomId: room.id,
      status: 'ready',
      themeSlugs: ['modern'],
      finishSlugs: ['veneer'],
    });
    const unresolved = await makeProjectReviewComment({ projectId: project.id });
    await makeProjectImage({
      projectId: project.id,
      roomId: room.id,
      status: 'ready',
      themeSlugs: ['modern'],
      finishSlugs: ['veneer'],
    });
    await makeProjectImage({
      projectId: project.id,
      roomId: room.id,
      status: 'ready',
      themeSlugs: ['modern'],
      finishSlugs: ['veneer'],
    });

    const submit = await app.request(`/api/projects/${project.id}/submit`, {
      method: 'POST',
      headers: { cookie },
    });
    expect(submit.status).toBe(200);
    const body = (await submit.json()) as ProjectDetailResponse;
    expect(body).toMatchObject({ id: project.id, status: 'submitted', reviewComments: [] });
    const [resolved] = await db
      .select()
      .from(schema.projectReviewComment)
      .where(eq(schema.projectReviewComment.id, unresolved.id));
    expect(resolved?.status).toBe('resolved');
  });

  it('rejects submitting incomplete draft projects with missing keys', async () => {
    const { cookie, designer } = await makeDesignerSession('+919800002015');
    const project = await makeProject({ designerId: designer.id, status: 'draft' });

    const res = await app.request(`/api/projects/${project.id}/submit`, {
      method: 'POST',
      headers: { cookie },
    });

    expect(res.status).toBe(422);
    const body = (await res.json()) as ErrorResponse;
    expect(body.error.details).toMatchObject({
      missing: expect.arrayContaining(['property-type', 'scope', 'cost-range']),
    });
  });

  it('reports completeness but rejects submit for published projects', async () => {
    const { cookie, designer } = await makeDesignerSession('+919800002021');
    const project = await makeProject({ designerId: designer.id, status: 'published' });

    const completeness = await app.request(`/api/projects/${project.id}/completeness`, {
      headers: { cookie },
    });
    expect(completeness.status).toBe(200);

    const submit = await app.request(`/api/projects/${project.id}/submit`, {
      method: 'POST',
      headers: { cookie },
    });
    expect(submit.status).toBe(409);
  });
});
