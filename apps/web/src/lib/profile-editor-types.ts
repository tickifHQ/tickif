import { taxonomyKindSchema, type TaxonomyTerm } from '@repo/contracts';

export const PROFILE_TAXONOMY_KIND = {
  CITY: taxonomyKindSchema.enum.city,
  SCOPE: taxonomyKindSchema.enum.scope,
  THEME: taxonomyKindSchema.enum.theme,
} as const;

export type ProfileTaxonomyKind =
  (typeof PROFILE_TAXONOMY_KIND)[keyof typeof PROFILE_TAXONOMY_KIND];

export type ProfileEditorOption = Pick<TaxonomyTerm, 'id' | 'label'>;

export type ProfileEditorTaxonomy = {
  cities: ProfileEditorOption[];
  scopes: ProfileEditorOption[];
  themes: ProfileEditorOption[];
};
