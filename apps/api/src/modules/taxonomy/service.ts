import type { ListTaxonomyResponse } from '@repo/contracts';
import { schema } from '@repo/db';
import { taxonomyRepository } from './repository.js';

/**
 * Taxonomy read service. Validates kind against the DB enum (single source of truth).
 * Unknown/missing kinds return empty arrays — never a validation error.
 */

/** Valid taxonomy kinds — derived from the DB enum, NOT a duplicated list. */
const VALID_KINDS: readonly string[] = schema.taxonomyKindEnum.enumValues;

export const taxonomyService = {
  async list(kind: string | undefined, parentId: string | undefined): Promise<ListTaxonomyResponse> {
    // Unknown or missing kind → graceful empty response (issue requirement)
    if (!kind || !VALID_KINDS.includes(kind)) {
      return { terms: [] };
    }

    // parentId is only meaningful for locality — ignore it for other kinds
    const effectiveParentId = kind === 'locality' ? parentId : undefined;

    const terms = await taxonomyRepository.listByKind(kind, effectiveParentId);
    return { terms };
  },
};
