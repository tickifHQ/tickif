import { describe, expect, it } from 'vitest';
import {
  bookingResponseSchema,
  bookingSlotSchema,
  cancelBookingSchema,
  confirmBookingSchema,
  createBookingSchema,
  listBookingsQuerySchema,
} from '../src/bookings.js';

const BOOKING_ID = '11111111-1111-4111-8111-111111111111';
const PROFILE_ID = '22222222-2222-4222-8222-222222222222';
const PROJECT_ID = '33333333-3333-4333-8333-333333333333';

const completedBooking = {
  id: BOOKING_ID,
  status: 'completed',
  organization: {
    id: 'organization-1',
    name: 'North Star Studio',
    slug: 'north-star-studio',
  },
  designerProfile: {
    id: PROFILE_ID,
    displayName: 'North Star Studio',
    slug: 'north-star-studio',
    logoUrl: null,
  },
  requester: {
    id: 'requester-1',
    name: 'Priya Shah',
    email: 'priya@example.com',
    phoneNumber: '+919800000001',
  },
  referredProject: {
    id: PROJECT_ID,
    title: 'Sunlit Bandra Apartment',
    slug: 'sunlit-bandra-apartment',
    coverImageUrl: null,
  },
  preferredSlots: [
    { date: '2026-08-03', window: 'morning' },
    { date: '2026-08-04', window: 'afternoon' },
  ],
  confirmedSlot: { date: '2026-08-04', window: 'afternoon' },
  message: 'I would like to discuss a renovation.',
  requestedAt: '2026-07-26T10:00:00.000Z',
  confirmedAt: '2026-07-27T10:00:00.000Z',
  completedAt: '2026-08-04T10:00:00.000Z',
  cancelledAt: null,
  cancelledBy: null,
  cancelledByUserId: null,
  cancelReason: null,
  createdAt: '2026-07-26T10:00:00.000Z',
  updatedAt: '2026-08-04T10:00:00.000Z',
  reviewEligible: true,
} as const;

describe('booking contracts', () => {
  it('accepts one to three unique preferred slots and trims the message', () => {
    const parsed = createBookingSchema.parse({
      designerProfileId: PROFILE_ID,
      referredProjectId: PROJECT_ID,
      preferredSlots: [
        { date: '2026-08-03', window: 'morning' },
        { date: '2026-08-04', window: 'evening' },
      ],
      message: '  Please call before confirming.  ',
    });

    expect(parsed.message).toBe('Please call before confirming.');
    expect(parsed.preferredSlots).toHaveLength(2);
  });

  it('rejects invalid dates, windows, slot counts, and duplicate slots', () => {
    expect(bookingSlotSchema.safeParse({ date: '2026-02-30', window: 'morning' }).success).toBe(
      false,
    );
    expect(bookingSlotSchema.safeParse({ date: '2026-08-03', window: 'night' }).success).toBe(
      false,
    );
    expect(
      createBookingSchema.safeParse({
        designerProfileId: PROFILE_ID,
        preferredSlots: [],
      }).success,
    ).toBe(false);
    expect(
      createBookingSchema.safeParse({
        designerProfileId: PROFILE_ID,
        preferredSlots: [
          { date: '2026-08-03', window: 'morning' },
          { date: '2026-08-03', window: 'morning' },
        ],
      }).success,
    ).toBe(false);
  });

  it('accepts an exact slot for confirmation', () => {
    expect(
      confirmBookingSchema.parse({
        confirmedSlot: { date: '2026-08-03', window: 'afternoon' },
      }),
    ).toEqual({
      confirmedSlot: { date: '2026-08-03', window: 'afternoon' },
    });
  });

  it('keeps cancellation reason optional and trims it when supplied', () => {
    expect(cancelBookingSchema.parse({})).toEqual({});
    expect(cancelBookingSchema.parse({ reason: '  Schedule changed  ' })).toEqual({
      reason: 'Schedule changed',
    });
    expect(cancelBookingSchema.safeParse({ reason: '   ' }).success).toBe(false);
  });

  it('coerces shared mine and inbox query pagination with optional status filtering', () => {
    expect(listBookingsQuerySchema.parse({})).toEqual({
      status: 'all',
      page: 1,
      limit: 12,
    });
    expect(
      listBookingsQuerySchema.parse({
        status: 'confirmed',
        page: '2',
        limit: '20',
      }),
    ).toEqual({
      status: 'confirmed',
      page: 2,
      limit: 20,
    });
    expect(listBookingsQuerySchema.safeParse({ status: 'open' }).success).toBe(false);
  });

  it('accepts a completed response with all related entities and lifecycle metadata', () => {
    expect(bookingResponseSchema.safeParse(completedBooking).success).toBe(true);
  });

  it('allows review eligibility only for completed bookings', () => {
    expect(
      bookingResponseSchema.safeParse({
        ...completedBooking,
        status: 'confirmed',
        completedAt: null,
        reviewEligible: true,
      }).success,
    ).toBe(false);
    expect(
      bookingResponseSchema.safeParse({
        ...completedBooking,
        reviewEligible: false,
      }).success,
    ).toBe(false);
  });
});
