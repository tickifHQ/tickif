import { describe, expect, it } from 'vitest';
import { makeDesigner, makeProject, makeTaxonomy } from '@repo/db/testing';
import { projectsRepository } from '../../../src/modules/projects/repository.js';
import { validateProjectTaxonomy } from '../../../src/modules/projects/service.js';
import { app } from '../../../src/app.js';

describe('public portfolio starting budget', () => {
  it('resolves retired budget labels without exposing other retired taxonomy labels', async () => {
    await makeTaxonomy({
      kind: 'budget_band',
      slug: 'upscale',
      label: '₹15L - ₹35L',
      isActive: false,
    });
    await makeTaxonomy({
      kind: 'city',
      slug: 'retired-city',
      label: 'Retired City',
      isActive: false,
    });
    const labels = await projectsRepository.findTaxonomyLabels([
      { kind: 'budget_band', slug: 'upscale' },
      { kind: 'budget_band', slug: 'missing' },
      { kind: 'city', slug: 'retired-city' },
    ]);
    expect([...labels]).toEqual([['budget_band:upscale', '₹15L - ₹35L']]);
    expect(await projectsRepository.findTaxonomyLabels([])).toEqual(new Map());
  });

  it('rejects new retired budget selections but preserves an unchanged saved budget', async () => {
    await makeTaxonomy({
      kind: 'budget_band',
      slug: 'upscale',
      label: '₹15L - ₹35L',
      isActive: false,
    });
    await makeTaxonomy({ kind: 'budget_band', slug: '10l-20l', label: '₹10L - ₹20L' });
    const designer = await makeDesigner();
    const existing = await makeProject({ designerId: designer.id, budgetBandSlug: 'upscale' });
    await expect(validateProjectTaxonomy({ budgetBandSlug: 'upscale' })).rejects.toMatchObject({
      status: 422,
    });
    await expect(validateProjectTaxonomy({ budgetBandSlug: 'missing' })).rejects.toMatchObject({
      status: 422,
    });
    await expect(
      validateProjectTaxonomy({ budgetBandSlug: 'upscale' }, existing),
    ).resolves.toBeUndefined();
    await expect(validateProjectTaxonomy({}, existing)).resolves.toBeUndefined();
    await expect(
      validateProjectTaxonomy({ budgetBandSlug: null }, existing),
    ).resolves.toBeUndefined();
    await expect(validateProjectTaxonomy({ budgetBandSlug: '10l-20l' })).resolves.toBeUndefined();
    await expect(
      validateProjectTaxonomy(
        { budgetBandSlug: 'upscale' },
        { ...existing, budgetBandSlug: '10l-20l' },
      ),
    ).rejects.toMatchObject({ status: 422 });

    const response = await app.request('/api/taxonomy/terms?kind=budget_band');
    expect(response.status).toBe(200);
    const body = (await response.json()) as { terms: { slug: string }[] };
    expect(body.terms.map((term) => term.slug)).toEqual(['10l-20l']);
  });

  it('keeps the starting budget for a published project with a retired range', async () => {
    const designer = await makeDesigner();
    await makeTaxonomy({
      kind: 'budget_band',
      slug: 'moderate',
      label: '₹5L - ₹15L',
      sortOrder: 9,
      isActive: false,
      metadata: { min: 500001, max: 1500000 },
    });
    await makeProject({ designerId: designer.id, budgetBandSlug: 'moderate' });

    expect(await projectsRepository.findLowestBudgetBandLabel(designer.id)).toBe('₹5L - ₹15L');
  });

  it('compares monetary lower bounds across current and retired ranges', async () => {
    const designer = await makeDesigner();
    for (const band of [
      { slug: 'moderate', label: '₹5L - ₹15L', sortOrder: 9, min: 500001, isActive: false },
      { slug: '30l-40l', label: '₹30L - ₹40L', sortOrder: 5, min: 3000001, isActive: true },
      { slug: 'budget', label: 'Under ₹5L', sortOrder: 1, min: 0, isActive: true },
    ]) {
      const { min, ...term } = band;
      await makeTaxonomy({ kind: 'budget_band', ...term, metadata: { min } });
      await makeProject({
        designerId: designer.id,
        budgetBandSlug: band.slug,
        status: band.slug === 'budget' ? 'draft' : 'published',
      });
    }

    expect(await projectsRepository.findLowestBudgetBandLabel(designer.id)).toBe('₹5L - ₹15L');
  });
});
