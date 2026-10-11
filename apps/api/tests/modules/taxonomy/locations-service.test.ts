import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/modules/taxonomy/locations-repository.js', () => ({
  locationsRepository: { findCity: vi.fn(), ensureCity: vi.fn(), ensureLocality: vi.fn() },
}));
const { locationsRepository } =
  await import('../../../src/modules/taxonomy/locations-repository.js');
const { locationsService } = await import('../../../src/modules/taxonomy/locations-service.js');
const city = {
  id: '11111111-1111-4111-8111-111111111111',
  label: 'New City',
  slug: 'new-city',
  parentId: null,
};

describe('create reusable locations', () => {
  it('creates a city and city-scoped locality for subsequent tagging and discovery', async () => {
    vi.mocked(locationsRepository.ensureCity).mockResolvedValue(city);
    const locality = {
      ...city,
      id: '22222222-2222-4222-8222-222222222222',
      label: 'New Area',
      slug: 'new-area',
      parentId: city.id,
    };
    vi.mocked(locationsRepository.ensureLocality).mockResolvedValue(locality);
    expect(
      await locationsService.create({ cityLabel: 'New City', localityLabel: 'New Area' }),
    ).toEqual({ city, locality });
    expect(locationsRepository.ensureLocality).toHaveBeenCalledWith(
      city.id,
      'New Area',
      'new-area',
    );
  });
  it('does not revive a deactivated city', async () => {
    vi.mocked(locationsRepository.ensureCity).mockResolvedValue(null);
    await expect(locationsService.create({ cityLabel: 'Blocked City' })).rejects.toMatchObject({
      status: 409,
    });
  });
  it('requires an existing active parent when creating an area', async () => {
    vi.mocked(locationsRepository.findCity).mockResolvedValue(null);
    await expect(
      locationsService.create({ citySlug: 'missing', localityLabel: 'New Area' }),
    ).rejects.toMatchObject({ status: 422 });
  });
});
