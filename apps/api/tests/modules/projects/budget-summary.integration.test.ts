import { describe, expect, it } from 'vitest';
import { makeDesigner, makeProject, makeTaxonomy } from '@repo/db/testing';
import { projectsRepository } from '../../../src/modules/projects/repository.js';

describe('public portfolio starting budget', () => {
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
