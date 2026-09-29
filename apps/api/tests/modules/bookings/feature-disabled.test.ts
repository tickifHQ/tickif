import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/lib/features.js', () => ({
  features: { consultations: false },
}));

vi.mock('../../../src/modules/bookings/repository.js', () => ({
  bookingsRepository: {
    findById: vi.fn(),
    list: vi.fn(),
    createWithLead: vi.fn(),
    transition: vi.fn(),
  },
}));

vi.mock('../../../src/modules/orgs/service.js', () => ({
  orgsService: { isMember: vi.fn(), isWriter: vi.fn() },
}));

const { bookingsService } = await import('../../../src/modules/bookings/service.js');
const { bookingsRepository } = await import('../../../src/modules/bookings/repository.js');

const caller = {
  userId: 'requester_1',
  name: 'Priya Shah',
  phoneNumber: '+919800000001',
  phoneNumberVerified: true,
  isBanned: false,
  activeOrgId: null,
  activeTeamId: null,
};

describe('disabled consultation feature', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fails closed before a booking can be created', async () => {
    await expect(
      bookingsService.create(
        {
          designerProfileId: '22222222-2222-4222-8222-222222222222',
          preferredSlots: [{ date: '2026-10-02', window: 'morning' }],
        },
        caller,
      ),
    ).rejects.toMatchObject({ status: 404 });

    expect(bookingsRepository.createWithLead).not.toHaveBeenCalled();
  });

  it('does not expose an existing consultation inbox', async () => {
    await expect(
      bookingsService.listMine({ status: 'all', page: 1, limit: 12 }, caller),
    ).rejects.toMatchObject({ status: 404 });

    expect(bookingsRepository.list).not.toHaveBeenCalled();
  });

  it.each([
    () =>
      bookingsService.confirm(
        '33333333-3333-4333-8333-333333333333',
        { confirmedSlot: { date: '2026-10-02', window: 'morning' } },
        caller,
      ),
    () => bookingsService.complete('33333333-3333-4333-8333-333333333333', caller),
    () =>
      bookingsService.cancel(
        '33333333-3333-4333-8333-333333333333',
        { reason: 'No longer needed' },
        caller,
      ),
  ])('blocks scheduling mutations before reading booking data', async (action) => {
    await expect(action()).rejects.toMatchObject({ status: 404 });
    expect(bookingsRepository.findById).not.toHaveBeenCalled();
  });
});
