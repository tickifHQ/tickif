import { beforeEach, describe, expect, it, vi } from 'vitest';
import { taxonomyService } from '../../../src/modules/taxonomy/service.js';
import { taxonomyRepository } from '../../../src/modules/taxonomy/repository.js';

vi.mock('../../../src/modules/taxonomy/repository.js', () => ({
  taxonomyRepository: { createRoom: vi.fn(), listByKind: vi.fn() },
}));

describe('custom room types', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates a searchable slug for a custom room', async () => {
    const term = {
      id: '88888888-8888-4888-8888-888888888888',
      label: 'Music & Media Room',
      slug: 'music-media-room',
      parentId: null,
    };
    vi.mocked(taxonomyRepository.createRoom).mockResolvedValue(term);
    expect(await taxonomyService.createRoom({ label: term.label })).toEqual(term);
    expect(taxonomyRepository.createRoom).toHaveBeenCalledWith(term.label, term.slug);
  });

  it('rejects a name that cannot form a room slug before writing', async () => {
    await expect(taxonomyService.createRoom({ label: '!!!' })).rejects.toMatchObject({
      status: 400,
    });
    expect(taxonomyRepository.createRoom).not.toHaveBeenCalled();
  });

  it('does not reactivate disabled room types', async () => {
    vi.mocked(taxonomyRepository.createRoom).mockResolvedValue(null);
    await expect(taxonomyService.createRoom({ label: 'Attic' })).rejects.toMatchObject({
      status: 409,
    });
  });
});
