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
    kind: TaxonomyKind | undefined,
    parentId: string | undefined,
  ): Promise<ListTaxonomyResponse> {
    if (!kind) return { terms: [] };

    // parentId is only meaningful for locality — ignore it for other kinds
    const effectiveParentId = kind === taxonomyKindSchema.enum.locality ? parentId : undefined;

    const terms = await taxonomyRepository.listByKind(kind, effectiveParentId);
    return { terms };
  },
};
