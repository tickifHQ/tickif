import { z } from 'zod';

export const bookingStatusSchema = z
  .enum(['requested', 'confirmed', 'completed', 'cancelled'])
  .meta({ id: 'BookingStatus' });
export type BookingStatus = z.infer<typeof bookingStatusSchema>;

export const bookingListStatusSchema = z
  .enum(['all', 'requested', 'confirmed', 'completed', 'cancelled'])
  .default('all')
  .meta({ id: 'BookingListStatus' });

const bookingWindowSchema = z.enum(['morning', 'afternoon', 'evening']);

export const bookingSlotSchema = z
  .object({
    date: z.iso.date(),
    window: bookingWindowSchema,
  })
  .meta({ id: 'BookingSlot' });
export type BookingSlot = z.infer<typeof bookingSlotSchema>;

/**
 * India-first product, so "today" resolves in IST rather than UTC — a requester
 * booking late evening for tomorrow otherwise straddles the UTC date boundary.
 */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** How far ahead a consultation may be proposed. */
const MAX_BOOKING_HORIZON_DAYS = 90;

function istDate(offsetMs = 0): string {
  return new Date(Date.now() + IST_OFFSET_MS + offsetMs).toISOString().slice(0, 10);
}

function assertUniqueSlots(slots: BookingSlot[], ctx: z.RefinementCtx): void {
  const seen = new Set<string>();
  for (const [index, slot] of slots.entries()) {
    const key = `${slot.date}:${slot.window}`;
    if (seen.has(key)) {
      ctx.addIssue({
        code: 'custom',
        message: 'Preferred slots must be unique',
        path: [index],
      });
    }
    seen.add(key);
  }
}

/**
 * Response shape. Deliberately carries no future-date rule: a booking made last
 * month is still valid to read back, and sharing one schema with the request would
 * make every historical booking fail serialization the day after it was created.
 */
const preferredSlotsSchema = z
  .array(bookingSlotSchema)
  .min(1)
  .max(3)
  .superRefine(assertUniqueSlots);

/**
 * Request shape. `z.iso.date()` validates format only, so without this a requester
 * can propose slots in the past — accepted end to end, landing in the designer's
 * inbox as a live booking and consuming one of their three open-booking slots.
 */
const requestedSlotsSchema = z
  .array(bookingSlotSchema)
  .min(1)
  .max(3)
  .superRefine((slots, ctx) => {
    assertUniqueSlots(slots, ctx);
    const today = istDate();
    const horizon = istDate(MAX_BOOKING_HORIZON_DAYS * 86_400_000);
    for (const [index, slot] of slots.entries()) {
      if (slot.date < today) {
        ctx.addIssue({
          code: 'custom',
          message: 'Preferred slots must not be in the past',
          path: [index],
        });
      } else if (slot.date > horizon) {
        ctx.addIssue({
          code: 'custom',
          message: `Preferred slots must be within ${MAX_BOOKING_HORIZON_DAYS} days`,
          path: [index],
        });
      }
    }
  });

export const createBookingSchema = z
  .object({
    designerProfileId: z.uuid(),
    referredProjectId: z.uuid().optional(),
    preferredSlots: requestedSlotsSchema,
    message: z.string().trim().min(1).max(2000).optional(),
  })
  .meta({ id: 'CreateBooking' });
export type CreateBookingInput = z.infer<typeof createBookingSchema>;

export const confirmBookingSchema = z
  .object({
    confirmedSlot: bookingSlotSchema,
  })
  .meta({ id: 'ConfirmBooking' });
export type ConfirmBookingInput = z.infer<typeof confirmBookingSchema>;

export const cancelBookingSchema = z
  .object({
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .meta({ id: 'CancelBooking' });
export type CancelBookingInput = z.infer<typeof cancelBookingSchema>;

export const bookingIdParamSchema = z
  .object({
    id: z.uuid(),
  })
  .meta({ id: 'BookingIdParam' });

export const listBookingsQuerySchema = z
  .object({
    status: bookingListStatusSchema,
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(12),
  })
  .meta({ id: 'ListBookingsQuery' });
export type ListBookingsQuery = z.infer<typeof listBookingsQuerySchema>;

/** UI callers send the state they rendered; legacy API clients retain status-CAS behavior. */
export const bookingMutationQuerySchema = z
  .object({ expectedStatus: bookingStatusSchema.optional() })
  .strict()
  .meta({ id: 'BookingMutationQuery' });

const bookingOrganizationSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
});

const bookingDesignerProfileSchema = z.object({
  id: z.uuid(),
  displayName: z.string(),
  slug: z.string().nullable(),
  logoUrl: z.url().nullable(),
});

const bookingRequesterSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.email(),
  phoneNumber: z.string().nullable(),
});

const bookingProjectSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  slug: z.string(),
  coverImageUrl: z.url().nullable(),
});

export const bookingResponseSchema = z
  .object({
    id: z.uuid(),
    status: bookingStatusSchema,
    organization: bookingOrganizationSchema,
    designerProfile: bookingDesignerProfileSchema,
    requester: bookingRequesterSchema,
    referredProject: bookingProjectSchema.nullable(),
    preferredSlots: preferredSlotsSchema,
    confirmedSlot: bookingSlotSchema.nullable(),
    message: z.string().nullable(),
    requestedAt: z.string().datetime(),
    confirmedAt: z.string().datetime().nullable(),
    completedAt: z.string().datetime().nullable(),
    cancelledAt: z.string().datetime().nullable(),
    cancelledBy: z.enum(['requester', 'designer']).nullable(),
    cancelledByUserId: z.string().nullable(),
    cancelReason: z.string().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    reviewEligible: z.boolean(),
  })
  .superRefine((booking, ctx) => {
    if (booking.reviewEligible !== (booking.status === 'completed')) {
      ctx.addIssue({
        code: 'custom',
        message: 'reviewEligible must be true only for completed bookings',
        path: ['reviewEligible'],
      });
    }
  })
  .meta({ id: 'BookingResponse' });
export type BookingResponse = z.infer<typeof bookingResponseSchema>;

export const listBookingsResponseSchema = z
  .object({
    items: z.array(bookingResponseSchema),
    page: z.number().int().min(1),
    limit: z.number().int().min(1),
    total: z.number().int().min(0),
    totalPages: z.number().int().min(0),
  })
  .meta({ id: 'ListBookingsResponse' });
export type ListBookingsResponse = z.infer<typeof listBookingsResponseSchema>;
