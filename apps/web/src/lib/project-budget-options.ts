import {
  designProjectBudgetBands,
  legacyProjectBudgetBands,
  projectBudgetBands,
  type TaxonomyTerm,
} from '@repo/contracts';

/** Scope is the editor's single selected delivery scope. Saved values stay editable. */
export function projectBudgetOptions(
  terms: Pick<TaxonomyTerm, 'slug' | 'label'>[],
  scope: string,
  savedSlug: string,
) {
  const designSlugs = new Set(designProjectBudgetBands.map((band) => band.slug));
  const replacedSlugs = new Set(projectBudgetBands.slice(0, 2).map((band) => band.slug));
  const legacySlugs = new Set(legacyProjectBudgetBands.map((band) => band.slug));
  const shared = terms.filter(
    (term) =>
      !legacySlugs.has(term.slug) &&
      !designSlugs.has(term.slug) &&
      (scope !== 'design' || !replacedSlugs.has(term.slug)),
  );
  const scoped =
    scope === 'design'
      ? designProjectBudgetBands.flatMap((band) => {
          const term = terms.find((term) => term.slug === band.slug);
          return term ? [term] : [];
        })
      : [];
  const options = [...scoped, ...shared].map((term) => ({ value: term.slug, label: term.label }));
  const saved =
    terms.find((term) => term.slug === savedSlug) ??
    [...projectBudgetBands, ...designProjectBudgetBands, ...legacyProjectBudgetBands].find(
      (band) => band.slug === savedSlug,
    );
  if (saved && !options.some((option) => option.value === saved.slug)) {
    options.push({ value: saved.slug, label: saved.label });
  }
  return options;
}

/** Only confirmed saved values may remain outside the next scope's choices. */
export function projectBudgetSelectionForScope(
  terms: Pick<TaxonomyTerm, 'slug' | 'label'>[],
  scope: string,
  selectedSlug: string,
  savedSlug: string,
) {
  if (selectedSlug === savedSlug) return selectedSlug;
  return projectBudgetOptions(terms, scope, savedSlug).some(
    (option) => option.value === selectedSlug,
  )
    ? selectedSlug
    : '';
}
