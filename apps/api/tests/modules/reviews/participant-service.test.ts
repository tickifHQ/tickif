import { describe, expect, it, vi } from 'vitest';
const repository = vi.hoisted(() => ({
  findOwn: vi.fn(),
  listOrganization: vi.fn(),
  findById: vi.fn(),
  update: vi.fn(),
}));
vi.mock('../../../src/modules/reviews/repository.js', () => ({ reviewsRepository: repository }));
const { reviewsService } = await import('../../../src/modules/reviews/service.js');
const caller = { userId: 'user', activeOrgId: null, phoneNumberVerified: true };
describe('participant review service', () => {
  it('reports author and organization access failures', async () => {
    repository.findOwn.mockResolvedValue({ kind: 'forbidden' });
    repository.listOrganization.mockResolvedValue({ kind: 'forbidden' });
    await expect(reviewsService.getOwn('profile', caller)).rejects.toMatchObject({ status: 403 });
    await expect(
      reviewsService.listOrganization({ designerProfileId: 'profile', page: 1, limit: 10 }, caller),
    ).rejects.toMatchObject({ status: 403 });
  });
  it('rejects writes from organization context before persistence', async () => {
    await expect(
      reviewsService.create(
        { designerProfileId: 'profile', rating: 5 },
        { ...caller, activeOrgId: 'org' },
      ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      reviewsService.update('review', { rating: 4 }, { ...caller, activeOrgId: 'org' }),
    ).rejects.toMatchObject({ status: 403 });
  });
  it('returns no private review when the author has not submitted', async () => {
    repository.findOwn.mockResolvedValue({ kind: 'ok', item: null, phoneVerified: true });
    await expect(reviewsService.getOwn('profile', caller)).resolves.toEqual({ item: null });
  });
});
