import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BookingViewRecord } from '../../../src/modules/bookings/repository.js';

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
const { orgsService } = await import('../../../src/modules/orgs/service.js');

const slot = { date: '2026-08-10', window: 'morning' } as const;
const secondSlot = { date: '2026-08-11', window: 'afternoon' } as const;

describe('rendered booking status protection', () => {
  it('does not cancel a newly confirmed booking from an old requested view', async () => {
    vi.mocked(bookingsRepository.findById).mockResolvedValue(
      row({ status: 'confirmed', confirmedSlot: slot }),
    );
    await expect(
      bookingsService.cancel('booking', { reason: 'Changed plans' }, caller, 'requested'),
    ).rejects.toMatchObject({ status: 409 });
  });
});

const caller = {
  userId: 'requester_1',
  name: 'Priya Shah',
  phoneNumber: '+919800000001',
  phoneNumberVerified: true,
  isBanned: false,
  activeOrgId: null,
  activeTeamId: null,
};

const designerCaller = {
  userId: 'designer_1',
  name: 'Studio Owner',
  phoneNumber: '+919800000002',
  phoneNumberVerified: true,
  isBanned: false,
  activeOrgId: 'org_1',
  activeTeamId: 'team_1',
};

function row(overrides: Partial<BookingViewRecord> = {}): BookingViewRecord {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    organizationId: 'org_1',
    designerTeamId: 'team_1',
    designerProfileId: '22222222-2222-4222-8222-222222222222',
    requesterId: caller.userId,
    referredProjectId: '33333333-3333-4333-8333-333333333333',
    preferredSlots: [slot, secondSlot],
    confirmedSlot: null,
    message: 'I would like to discuss my renovation.',
    status: 'requested',
    cancelledBy: null,
    cancelledByUserId: null,
    cancelReason: null,
    requestedAt: new Date('2026-08-01T10:00:00.000Z'),
    confirmedAt: null,
    completedAt: null,
    cancelledAt: null,
    createdAt: new Date('2026-08-01T10:00:00.000Z'),
    updatedAt: new Date('2026-08-01T10:00:00.000Z'),
    requesterName: caller.name,
    requesterEmail: 'priya@example.com',
    requesterPhoneNumber: caller.phoneNumber,
    organizationName: 'Studio One',
    organizationSlug: 'studio-one',
    designerDisplayName: 'Studio One',
    designerPortfolioSlug: null,
    referredProjectTitle: 'Bandra Apartment',
    referredProjectSlug: 'bandra-apartment',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(orgsService.isMember).mockResolvedValue(true);
  vi.mocked(orgsService.isWriter).mockResolvedValue(true);
});

describe('bookingsService.create', () => {
  it('creates a requested booking through the atomic repository operation', async () => {
    vi.mocked(bookingsRepository.createWithLead).mockResolvedValue({
      kind: 'created',
      booking: row(),
    });

    const result = await bookingsService.create(
      {
        designerProfileId: row().designerProfileId,
        referredProjectId: '33333333-3333-4333-8333-333333333333',
        preferredSlots: [slot, secondSlot],
        message: 'I would like to discuss my renovation.',
      },
      caller,
    );

    expect(bookingsRepository.createWithLead).toHaveBeenCalledWith({
      designerProfileId: row().designerProfileId,
      referredProjectId: row().referredProjectId,
      preferredSlots: [slot, secondSlot],
      message: row().message,
      requesterId: caller.userId,
      requesterName: caller.name,
      requesterPhoneNumber: caller.phoneNumber,
    });
    expect(result).toMatchObject({ status: 'requested', reviewEligible: false });
  });

  it('requires a verified phone number', async () => {
    await expect(
      bookingsService.create(
        {
          designerProfileId: row().designerProfileId,
          preferredSlots: [slot],
        },
        { ...caller, phoneNumberVerified: false },
      ),
    ).rejects.toMatchObject({ status: 422 });
    expect(bookingsRepository.createWithLead).not.toHaveBeenCalled();
  });

  it('maps the atomic open-booking limit to a conflict', async () => {
    vi.mocked(bookingsRepository.createWithLead).mockResolvedValue({
      kind: 'open_limit_reached',
    });

    await expect(
      bookingsService.create(
        {
          designerProfileId: row().designerProfileId,
          preferredSlots: [slot],
        },
        caller,
      ),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('treats booking your own studio as an authorization failure', async () => {
    vi.mocked(bookingsRepository.createWithLead).mockResolvedValue({ kind: 'own_studio' });

    await expect(
      bookingsService.create(
        { designerProfileId: row().designerProfileId, preferredSlots: [slot] },
        caller,
      ),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('rejects designers without a notification destination', async () => {
    vi.mocked(bookingsRepository.createWithLead).mockResolvedValue({
      kind: 'designer_not_notifiable',
    });

    await expect(
      bookingsService.create(
        {
          designerProfileId: row().designerProfileId,
          preferredSlots: [slot],
        },
        caller,
      ),
    ).rejects.toMatchObject({ status: 422 });
  });
});

describe('bookingsService listing', () => {
  it('lists requester bookings with status and pagination', async () => {
    vi.mocked(bookingsRepository.list).mockResolvedValue({ items: [row()], total: 13 });

    const result = await bookingsService.listMine(
      { status: 'requested', page: 2, limit: 12 },
      caller,
    );

    expect(bookingsRepository.list).toHaveBeenCalledWith({
      requesterId: caller.userId,
      status: 'requested',
      limit: 12,
      offset: 12,
    });
    expect(result).toMatchObject({ page: 2, limit: 12, total: 13, totalPages: 2 });
  });

  it('requires active organization membership for the designer inbox', async () => {
    vi.mocked(orgsService.isMember).mockResolvedValue(false);

    await expect(
      bookingsService.listInbox({ status: 'all', page: 1, limit: 12 }, designerCaller),
    ).rejects.toMatchObject({ status: 403 });
    expect(bookingsRepository.list).not.toHaveBeenCalled();
  });

  it('scopes the designer inbox to the active branch', async () => {
    vi.mocked(bookingsRepository.list).mockResolvedValue({ items: [row()], total: 1 });

    await bookingsService.listInbox({ status: 'all', page: 1, limit: 12 }, designerCaller);

    expect(bookingsRepository.list).toHaveBeenCalledWith({
      organizationId: designerCaller.activeOrgId,
      designerTeamId: designerCaller.activeTeamId,
      status: undefined,
      limit: 12,
      offset: 0,
    });
  });
});

describe('bookingsService transitions', () => {
  it('confirms exactly one requester-proposed slot', async () => {
    vi.mocked(bookingsRepository.findById).mockResolvedValue(row());
    vi.mocked(bookingsRepository.transition).mockResolvedValue(
      row({
        status: 'confirmed',
        confirmedSlot: secondSlot,
        confirmedAt: new Date('2026-08-02T10:00:00.000Z'),
      }),
    );

    const result = await bookingsService.confirm(
      row().id,
      { confirmedSlot: secondSlot },
      designerCaller,
    );

    expect(bookingsRepository.transition).toHaveBeenCalledWith({
      id: row().id,
      expectedStatus: 'requested',
      toStatus: 'confirmed',
      confirmedSlot: secondSlot,
    });
    expect(result.status).toBe('confirmed');
  });

  it('rejects confirmation of a slot the requester did not propose', async () => {
    vi.mocked(bookingsRepository.findById).mockResolvedValue(row());

    await expect(
      bookingsService.confirm(
        row().id,
        { confirmedSlot: { date: '2026-09-01', window: 'evening' } },
        designerCaller,
      ),
    ).rejects.toMatchObject({ status: 422 });
    expect(bookingsRepository.transition).not.toHaveBeenCalled();
  });

  it('completes only confirmed bookings and exposes review eligibility', async () => {
    const confirmed = row({ status: 'confirmed', confirmedSlot: slot });
    vi.mocked(bookingsRepository.findById).mockResolvedValue(confirmed);
    vi.mocked(bookingsRepository.transition).mockResolvedValue(
      row({
        status: 'completed',
        confirmedSlot: slot,
        completedAt: new Date('2026-08-12T10:00:00.000Z'),
      }),
    );

    const result = await bookingsService.complete(row().id, designerCaller);

    expect(bookingsRepository.transition).toHaveBeenCalledWith({
      id: row().id,
      expectedStatus: 'confirmed',
      toStatus: 'completed',
    });
    expect(result.reviewEligible).toBe(true);
  });

  it('lets the requester cancel an open booking without a reason', async () => {
    vi.mocked(bookingsRepository.findById).mockResolvedValue(row());
    vi.mocked(bookingsRepository.transition).mockResolvedValue(
      row({ status: 'cancelled', cancelledBy: 'requester' }),
    );

    await bookingsService.cancel(row().id, {}, caller);

    expect(bookingsRepository.transition).toHaveBeenCalledWith({
      id: row().id,
      expectedStatus: 'requested',
      toStatus: 'cancelled',
      cancelledBy: 'requester',
      cancelledByUserId: caller.userId,
      cancelReason: null,
    });
  });

  it('preserves the selected slot when cancelling a confirmed booking', async () => {
    const confirmed = row({
      status: 'confirmed',
      confirmedSlot: slot,
      confirmedAt: new Date('2026-08-02T10:00:00.000Z'),
    });
    vi.mocked(bookingsRepository.findById).mockResolvedValue(confirmed);
    vi.mocked(bookingsRepository.transition).mockResolvedValue(
      row({
        status: 'cancelled',
        confirmedSlot: slot,
        confirmedAt: confirmed.confirmedAt,
        cancelledBy: 'requester',
      }),
    );

    await bookingsService.cancel(row().id, {}, caller);

    expect(bookingsRepository.transition).toHaveBeenCalledWith({
      id: row().id,
      expectedStatus: 'confirmed',
      toStatus: 'cancelled',
      cancelledBy: 'requester',
      cancelledByUserId: caller.userId,
      cancelReason: null,
    });
  });

  it('requires a designer cancellation reason', async () => {
    vi.mocked(bookingsRepository.findById).mockResolvedValue(row());

    await expect(bookingsService.cancel(row().id, {}, designerCaller)).rejects.toMatchObject({
      status: 422,
    });
    expect(bookingsRepository.transition).not.toHaveBeenCalled();
  });

  it('rejects booking mutations from read-only organization members', async () => {
    vi.mocked(bookingsRepository.findById).mockResolvedValue(row());
    vi.mocked(orgsService.isWriter).mockResolvedValue(false);

    await expect(
      bookingsService.confirm(row().id, { confirmedSlot: slot }, designerCaller),
    ).rejects.toMatchObject({ status: 403 });
    expect(bookingsRepository.transition).not.toHaveBeenCalled();
  });

  it('hides bookings belonging to another branch from designer mutations', async () => {
    vi.mocked(bookingsRepository.findById).mockResolvedValue(row({ designerTeamId: 'team_2' }));

    await expect(
      bookingsService.confirm(row().id, { confirmedSlot: slot }, designerCaller),
    ).rejects.toMatchObject({ status: 404 });
    expect(orgsService.isWriter).not.toHaveBeenCalled();
    expect(bookingsRepository.transition).not.toHaveBeenCalled();
  });

  it('rejects terminal-state transitions', async () => {
    vi.mocked(bookingsRepository.findById).mockResolvedValue(row({ status: 'completed' }));

    await expect(bookingsService.cancel(row().id, {}, caller)).rejects.toMatchObject({
      status: 409,
    });
  });

  it('rejects confirmation outside the requested state', async () => {
    vi.mocked(bookingsRepository.findById).mockResolvedValue(
      row({ status: 'confirmed', confirmedSlot: slot }),
    );

    await expect(
      bookingsService.confirm(row().id, { confirmedSlot: slot }, designerCaller),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('rejects completion outside the confirmed state', async () => {
    vi.mocked(bookingsRepository.findById).mockResolvedValue(row({ status: 'requested' }));

    await expect(bookingsService.complete(row().id, designerCaller)).rejects.toMatchObject({
      status: 409,
    });
  });

  it('returns a conflict when the compare-and-swap update loses a race', async () => {
    vi.mocked(bookingsRepository.findById).mockResolvedValue(row());
    vi.mocked(bookingsRepository.transition).mockResolvedValue(null);

    await expect(
      bookingsService.confirm(row().id, { confirmedSlot: slot }, designerCaller),
    ).rejects.toMatchObject({ status: 409 });
  });

  // A 422 here would distinguish an existing booking id from an unknown one, since
  // findById already answers 404 for the latter.
  it('does not reveal that a booking exists to a caller with no active organization', async () => {
    vi.mocked(bookingsRepository.findById).mockResolvedValue(row({ requesterId: 'someone_else' }));
    const stranger = { ...caller, userId: 'stranger_1', activeOrgId: null };

    await expect(
      bookingsService.confirm(row().id, { confirmedSlot: slot }, stranger),
    ).rejects.toMatchObject({ status: 404 });
    await expect(bookingsService.complete(row().id, stranger)).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      bookingsService.cancel(row().id, { reason: 'no longer needed' }, stranger),
    ).rejects.toMatchObject({ status: 404 });
    expect(bookingsRepository.transition).not.toHaveBeenCalled();
  });
});

describe('bookingsService designer slug resolution', () => {
  it('prefers the designer-chosen portfolio slug over the org slug', async () => {
    vi.mocked(bookingsRepository.findById).mockResolvedValue(
      row({ designerPortfolioSlug: 'studio-one-interiors' }),
    );
    vi.mocked(bookingsRepository.transition).mockResolvedValue(
      row({
        designerPortfolioSlug: 'studio-one-interiors',
        status: 'confirmed',
        confirmedSlot: slot,
      }),
    );

    const result = await bookingsService.confirm(row().id, { confirmedSlot: slot }, designerCaller);

    expect(result.designerProfile.slug).toBe('studio-one-interiors');
  });

  it('falls back to the org slug when the designer never chose one', async () => {
    vi.mocked(bookingsRepository.findById).mockResolvedValue(row());
    vi.mocked(bookingsRepository.transition).mockResolvedValue(
      row({ status: 'confirmed', confirmedSlot: slot }),
    );

    const result = await bookingsService.confirm(row().id, { confirmedSlot: slot }, designerCaller);

    expect(result.designerProfile.slug).toBe('studio-one');
  });
});
