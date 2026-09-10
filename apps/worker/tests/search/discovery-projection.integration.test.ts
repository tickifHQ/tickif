import { describe, expect, it } from 'vitest';
import { db, eq, schema } from '@repo/db';
import { makeDesigner, makeProject, makeProjectRoom, makeTaxonomy } from '@repo/db/testing';
import { findDesignerSearchSource, findProjectSearchSource } from '../../src/search/repository.js';
import { mapDesignerSearchDocument, mapProjectSearchDocument } from '../../src/search/mapper.js';

describe('discovery projection source', () => {
  it('searches published portfolio rooms but never draft or unpublished content', async () => {
    const designer = await makeDesigner({ status: 'active' });
    const project = await makeProject({
      designerId: designer.id,
      title: 'Public retreat',
      publishedAt: new Date(),
    });
    const room = await makeTaxonomy({ kind: 'room', slug: 'bedroom', label: 'Bedroom' });
    await makeProjectRoom({ projectId: project.id, roomTypeId: room.id, name: 'Master bedroom' });
    await makeProject({ designerId: designer.id, title: 'Secret draft kitchen', status: 'draft' });
    let source = await findDesignerSearchSource(designer.id);
    expect(source).not.toBeNull();
    let document = mapDesignerSearchDocument(source!);
    expect(document.portfolioTerms).toContain('Bedroom');
    expect(document.portfolioTerms?.join(' ')).not.toContain('Secret');
    await db
      .update(schema.project)
      .set({ status: 'archived' })
      .where(eq(schema.project.id, project.id));
    source = await findDesignerSearchSource(designer.id);
    document = mapDesignerSearchDocument(source!);
    expect(document.portfolioTerms).toEqual([]);
  });
  it('projects paid coverage for both collections and removes it for a locked account', async () => {
    const designer = await makeDesigner({ status: 'active' });
    const project = await makeProject({ designerId: designer.id, publishedAt: new Date() });
    const until = new Date('2030-01-01T00:00:00Z');
    await db.insert(schema.subscription).values({
      organizationId: designer.orgId,
      planTier: 'professional_plus',
      subscriptionState: 'active',
      currentPeriodEnd: until,
      cancelAtPeriodEnd: true,
    });
    expect(
      mapDesignerSearchDocument((await findDesignerSearchSource(designer.id))!).paidUntil,
    ).toBe(until.getTime());
    expect(mapProjectSearchDocument((await findProjectSearchSource(project.id))!).paidUntil).toBe(
      until.getTime(),
    );
    await db
      .update(schema.subscription)
      .set({
        subscriptionState: 'locked',
        lockedAt: new Date(),
        graceStartedAt: new Date(),
        preLapseTier: 'professional_plus',
      })
      .where(eq(schema.subscription.organizationId, designer.orgId));
    expect(
      mapDesignerSearchDocument((await findDesignerSearchSource(designer.id))!).paidUntil,
    ).toBe(0);
    expect(mapProjectSearchDocument((await findProjectSearchSource(project.id))!).paidUntil).toBe(
      0,
    );
  });
});
