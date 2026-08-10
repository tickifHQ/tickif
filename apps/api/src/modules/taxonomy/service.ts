import {
  taxonomyKindSchema,
  type ListTaxonomyResponse,
  type TaxonomyKind,
} from '@repo/contracts';
import { taxonomyRepository } from './repository.js';

/**
 * Taxonomy read service. The route contract validates kinds before this layer.
 * A missing kind returns an empty array for the unfiltered public request.
 */

export const taxonomyService = {
  async list(
    kind: string | undefined,
    parentId: string | undefined,
  ): Promise<ListTaxonomyResponse> {
    const parsedKind = taxonomyKindSchema.safeParse(kind);
    if (!parsedKind.success) return { terms: [] };
    const validKind: TaxonomyKind = parsedKind.data;

    // parentId is only meaningful for locality — ignore it for other kinds
    const effectiveParentId =
      validKind === taxonomyKindSchema.enum.locality ? parentId : undefined;

    const terms = await taxonomyRepository.listByKind(validKind, effectiveParentId);
    return { terms };
  },
};
