import type { Synonyms } from 'meilisearch';

/**
 * Product-owned vocabulary tuning. Keep pairs symmetric so either regional or
 * colloquial term can match the canonical labels stored in search documents.
 */
export const SEARCH_SYNONYMS = {
  bengaluru: ['bangalore'],
  bangalore: ['bengaluru'],
  washroom: ['bathroom'],
  bathroom: ['washroom'],
  hall: ['living room', 'living-room'],
  'living room': ['hall', 'living-room'],
  'living-room': ['hall', 'living room'],
  wardrobe: ['closet'],
  closet: ['wardrobe'],
  'pooja room': ['prayer room'],
  'prayer room': ['pooja room'],
  foyer: ['entrance'],
  entrance: ['foyer'],
} satisfies Exclude<Synonyms, null>;
