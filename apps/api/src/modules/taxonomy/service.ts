import {
  taxonomyKindSchema,
  type ListTaxonomyResponse,
  type TaxonomyKind,
  type CreateRoomTypeInput,
} from '@repo/contracts';
import { AppError } from '../../lib/errors.js';
import { taxonomyRepository } from './repository.js';

/**
 * Taxonomy read service. The route contract validates kinds before this layer.
 * A missing kind returns an empty array for the unfiltered public request.
 */

export const taxonomyService = {
  async createRoom(input: CreateRoomTypeInput) {
    const slug = input.label
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    if (!slug) throw AppError.badRequest('Room type must contain letters or numbers.');
    const term = await taxonomyRepository.createRoom(input.label, slug);
    if (!term) throw AppError.conflict('This room type is unavailable. Choose another name.');
    return term;
  },
  async list(
    kind: string | undefined,
    parentId: string | undefined,
  ): Promise<ListTaxonomyResponse> {
    const parsedKind = taxonomyKindSchema.safeParse(kind);
    if (!parsedKind.success) return { terms: [] };
    const validKind: TaxonomyKind = parsedKind.data;

    // parentId is only meaningful for locality — ignore it for other kinds
    const effectiveParentId = validKind === taxonomyKindSchema.enum.locality ? parentId : undefined;

    const terms = await taxonomyRepository.listByKind(validKind, effectiveParentId);
    return { terms };
  },
};
