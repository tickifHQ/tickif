import type { TaxonomyTerm } from '@repo/contracts';

export type ProfileEditorTaxonomy = {
  cities: TaxonomyTerm[];
  scopes: TaxonomyTerm[];
  themes: TaxonomyTerm[];
};
