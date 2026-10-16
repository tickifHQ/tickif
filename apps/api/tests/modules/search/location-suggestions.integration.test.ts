import { describe, expect, it } from 'vitest';
import { db, schema } from '@repo/db';
import { findFilterSuggestions } from '../../../src/modules/search/repository.js';
import { makeDesigner, makeProject, makeProjectImage } from '@repo/db/testing';
import { discoveryRepository } from '../../../src/modules/discovery/repository.js';
import { SORT_POSTGRES } from '../../../src/modules/discovery/constants.js';

describe('saved location search suggestions', () => {
  it('finds custom cities and keeps duplicate area names scoped to their city', async () => {
    const [vapi, other] = await db
      .insert(schema.taxonomy)
      .values([
        { kind: 'city', slug: 'vapi', label: 'Vapi' },
        { kind: 'city', slug: 'other-city', label: 'Other City' },
      ])
      .returning();
    await db.insert(schema.taxonomy).values([
      { kind: 'locality', slug: 'gunjan', label: 'Gunjan', parentId: vapi!.id },
      { kind: 'locality', slug: 'gunjan', label: 'Gunjan', parentId: other!.id },
    ]);
    expect(await findFilterSuggestions('Vapi')).toContainEqual({
      kind: 'city',
      filterKey: 'city',
      slug: 'vapi',
      label: 'Vapi',
    });
    expect(await findFilterSuggestions('Gunjan')).toEqual(
      expect.arrayContaining([
        {
          kind: 'area',
          filterKey: 'locality',
          slug: 'gunjan',
          label: 'Gunjan, Vapi',
          citySlug: 'vapi',
        },
        {
          kind: 'area',
          filterKey: 'locality',
          slug: 'gunjan',
          label: 'Gunjan, Other City',
          citySlug: 'other-city',
        },
      ]),
    );
  });

  it('does not suggest inactive cities or their areas', async () => {
    const [city] = await db
      .insert(schema.taxonomy)
      .values({
        kind: 'city',
        slug: 'hidden-city',
        label: 'Hidden City',
        isActive: false,
      })
      .returning();
    await db.insert(schema.taxonomy).values({
      kind: 'locality',
      slug: 'hidden-area',
      label: 'Hidden Area',
      parentId: city!.id,
    });
    expect(await findFilterSuggestions('Hidden')).toEqual([]);
  });

  it('finds a published project by custom city and area without mixing cities or exposing drafts', async () => {
    const designer = await makeDesigner({ status: 'active' });
    const expected = await makeProject({
      designerId: designer.id,
      status: 'published',
      publishedAt: new Date(),
      citySlug: 'vapi',
      localitySlug: 'gunjan',
    });
    const other = await makeProject({
      designerId: designer.id,
      status: 'published',
      publishedAt: new Date(),
      citySlug: 'other-city',
      localitySlug: 'gunjan',
    });
    const draft = await makeProject({
      designerId: designer.id,
      status: 'draft',
      citySlug: 'vapi',
      localitySlug: 'gunjan',
    });
    for (const project of [expected, other, draft]) {
      await makeProjectImage({ projectId: project.id, status: 'ready', isLive: true });
    }
    const result = await discoveryRepository.listFeedFallback({
      filterBy: { citySlug: 'vapi', localitySlug: 'gunjan' },
      sortBy: SORT_POSTGRES.recent,
      offset: 0,
      limit: 24,
    });
    expect(result.rows.map((row) => row.id)).toEqual([expected.id]);
  });
});
