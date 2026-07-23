import type { SynonymItemSchema, SynonymSetCreateSchema } from 'typesense';

/**
 * Product-owned vocabulary tuning. Typesense multi-way items make every term
 * in a group equivalent, including regional and colloquial variants.
 */
export const SEARCH_SYNONYMS = [
  { id: 'bengaluru-bangalore', synonyms: ['bengaluru', 'bangalore'] },
  { id: 'washroom-bathroom', synonyms: ['washroom', 'bathroom'] },
  { id: 'hall-living-room', synonyms: ['hall', 'living room', 'living-room'] },
  { id: 'wardrobe-closet', synonyms: ['wardrobe', 'closet'] },
  { id: 'pooja-prayer-room', synonyms: ['pooja room', 'prayer room'] },
  { id: 'foyer-entrance', synonyms: ['foyer', 'entrance'] },
] satisfies SynonymItemSchema[];

export const SEARCH_SYNONYM_SET = {
  items: SEARCH_SYNONYMS,
} satisfies SynonymSetCreateSchema;
