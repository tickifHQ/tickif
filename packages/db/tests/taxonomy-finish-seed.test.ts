import { finishes } from '../src/seeds/taxonomy.js';

/**
 * Issue #17 — the "Material & finish" project selector loads `finish` taxonomy
 * terms, so the five requested options are seeded as finishes to be selectable
 * on create/edit and flow through the existing finish search facet.
 */
describe('taxonomy finish seed', () => {
  const bySlug = new Map(finishes.map((term) => [term.slug, term]));

  it('seeds every finish under the finish kind', () => {
    expect(finishes.every((term) => term.kind === 'finish')).toBe(true);
  });

  it('preserves the existing finish options', () => {
    for (const slug of [
      'laminate',
      'acrylic-gloss',
      'acrylic-matte',
      'pu',
      'membrane',
      'veneer',
      'glass',
      'fabric',
    ]) {
      expect(bySlug.has(slug)).toBe(true);
    }
  });

  it('adds the five missing finish options with the requested labels', () => {
    expect(bySlug.get('lacquered-glass')?.label).toBe('Lacquered Glass');
    expect(bySlug.get('stone')?.label).toBe('Stone');
    expect(bySlug.get('metal')?.label).toBe('Metal');
    expect(bySlug.get('upvc')?.label).toBe('UPVC');
    expect(bySlug.get('aluminium')?.label).toBe('Aluminium');
  });

  it('keeps finish slugs unique', () => {
    expect(new Set(finishes.map((term) => term.slug)).size).toBe(finishes.length);
  });

  it('assigns contiguous, non-overlapping sort orders', () => {
    const sortOrders = finishes.map((term) => term.sortOrder);
    expect(sortOrders).toEqual(Array.from({ length: finishes.length }, (_, index) => index + 1));
  });
});
