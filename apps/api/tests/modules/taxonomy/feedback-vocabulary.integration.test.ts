import { describe, expect, it } from 'vitest';
import { seedTaxonomy } from '@repo/db/seeds/taxonomy';
import { db, schema, and, eq } from '@repo/db';
import { app } from '../../../src/app.js';
import { makeDesigner, makeProject, makeProjectImage } from '@repo/db/testing';
import { findFilterSuggestions } from '../../../src/modules/search/repository.js';
import { discoveryRepository } from '../../../src/modules/discovery/repository.js';
import { SORT_POSTGRES } from '../../../src/modules/discovery/constants.js';

describe('October feedback taxonomy', () => {
  it('offers all requested material/finish choices and a commercial Hospital', async () => {
    await seedTaxonomy();
    const response = await app.request('/api/taxonomy/terms?kind=finish');
    const body: { terms: { slug: string; label: string }[] } = await response.json();
    expect(body.terms.map((term) => term.label)).toEqual(
      expect.arrayContaining([
        'Acrylic (Glossy)',
        'Acrylic (Matte)',
        'PU (Polyurethane)',
        'Membrane',
        'Veneer',
        'Lacquered glass',
        'Fabric',
        'Stone',
        'Metal',
        'UPVC',
        'PVC',
        'Aluminium',
      ]),
    );
    const [hospital] = await db
      .select()
      .from(schema.taxonomy)
      .where(
        and(eq(schema.taxonomy.kind, 'property_subtype'), eq(schema.taxonomy.slug, 'hospital')),
      );
    expect(hospital?.metadata.propertyTypeSlug).toBe('commercial-workspace');
    const materialResponse = await app.request('/api/taxonomy/terms?kind=material');
    const materials: { terms: { label: string }[] } = await materialResponse.json();
    expect(materials.terms.map((term) => term.label)).toEqual(
      expect.arrayContaining([
        'Lacquered glass',
        'Fabric',
        'Stone',
        'Metal',
        'UPVC',
        'PVC',
        'Aluminium',
      ]),
    );
  });
  it('finds a published tagged project through the new material choice', async () => {
    await seedTaxonomy();
    const designer = await makeDesigner({ status: 'active' });
    const project = await makeProject({
      designerId: designer.id,
      status: 'published',
      publishedAt: new Date('2026-10-10'),
    });
    await makeProjectImage({
      projectId: project.id,
      status: 'ready',
      isLive: true,
      materialSlugs: ['lacquered-glass'],
      finishSlugs: ['lacquered-glass'],
    });
    expect(await findFilterSuggestions('Lacquered glass')).toContainEqual({
      kind: 'material',
      filterKey: 'material',
      slug: 'lacquered-glass',
      label: 'Lacquered glass',
    });
    const feed = await discoveryRepository.listFeedFallback({
      filterBy: { materials: 'lacquered-glass' },
      offset: 0,
      limit: 24,
      sortBy: SORT_POSTGRES.recent,
    });
    expect(feed.rows.map((row) => row.id)).toContain(project.id);
  });
});
