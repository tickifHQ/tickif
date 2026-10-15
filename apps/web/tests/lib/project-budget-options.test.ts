import { describe, expect, it } from 'vitest';
import { legacyProjectBudgetBands, projectBudgetBands } from '@repo/contracts';
import {
  projectBudgetOptions,
  projectBudgetSelectionForScope,
} from '../../src/lib/project-budget-options';

const terms = [
  ...projectBudgetBands,
  ...legacyProjectBudgetBands,
  { slug: 'under-1l', label: 'Under ₹1L' },
  { slug: '2l-4l', label: '₹2L–₹4L' },
];

describe('scope-specific cost ranges', () => {
  it('offers the requested first two ranges for Design and preserves the remaining six', () => {
    expect(projectBudgetOptions(terms, 'design', '').map((term) => term.value)).toEqual([
      'under-1l',
      '2l-4l',
      ...projectBudgetBands.slice(2).map((band) => band.slug),
    ]);
  });

  it.each(['construction', 'interior-execution', ''])('keeps the eight ranges for %s', (scope) => {
    expect(projectBudgetOptions(terms, scope, '').map((term) => term.value)).toEqual(
      projectBudgetBands.map((band) => band.slug),
    );
  });

  it.each(['budget', '5l-10l', 'moderate', 'upscale', 'luxury'])(
    'preserves a saved %s when editing Design projects',
    (saved) => {
      expect(projectBudgetOptions(terms, 'design', saved).at(-1)?.value).toBe(saved);
    },
  );

  it('preserves a saved design range when changing scope instead of silently replacing it', () => {
    expect(projectBudgetOptions(terms, 'construction', 'under-1l').at(-1)?.label).toBe('Under ₹1L');
  });

  it('does not offer unseeded ranges that would fail the API taxonomy check', () => {
    expect(
      projectBudgetOptions(projectBudgetBands, 'design', '').map((term) => term.value),
    ).not.toContain('under-1l');
  });

  it.each([
    ['design', 'budget'],
    ['design', '5l-10l'],
    ['construction', 'under-1l'],
    ['construction', '2l-4l'],
    ['interior-execution', 'under-1l'],
    ['interior-execution', '2l-4l'],
  ])('clears unsaved %s-incompatible %s selections', (scope, selected) => {
    expect(projectBudgetSelectionForScope(terms, scope, selected, '')).toBe('');
    expect(projectBudgetSelectionForScope(terms, scope, selected, 'moderate')).toBe('');
    expect(projectBudgetOptions(terms, scope, '').map((option) => option.value)).not.toContain(
      selected,
    );
  });

  it.each(['construction', 'interior-execution', 'design'])(
    'keeps shared unsaved ranges for %s',
    (scope) => {
      for (const band of projectBudgetBands.slice(2)) {
        expect(projectBudgetSelectionForScope(terms, scope, band.slug, '')).toBe(band.slug);
      }
    },
  );

  it.each(['budget', '5l-10l', 'under-1l', '2l-4l', 'moderate', 'upscale', 'luxury'])(
    'preserves confirmed saved %s even when the catalog is unavailable',
    (saved) => {
      for (const scope of ['construction', 'interior-execution', 'design']) {
        expect(projectBudgetSelectionForScope([], scope, saved, saved)).toBe(saved);
      }
    },
  );

  it('does not select a saved budget in place of a cleared or unrelated unsaved value', () => {
    expect(projectBudgetSelectionForScope(terms, 'design', '', 'moderate')).toBe('');
    expect(projectBudgetSelectionForScope(terms, 'design', 'budget', 'moderate')).toBe('');
    expect(projectBudgetSelectionForScope(terms, 'design', 'not-a-budget', 'moderate')).toBe('');
  });

  it('rejects an unsaved design range missing from the active catalog', () => {
    expect(projectBudgetSelectionForScope(projectBudgetBands, 'design', 'under-1l', '')).toBe('');
  });
});
