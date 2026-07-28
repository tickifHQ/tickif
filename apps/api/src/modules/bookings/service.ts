import type {
  BookingResponse,
  BookingSlot,
  BookingStatus,
  CancelBookingInput,
  ConfirmBookingInput,
  CreateBookingInput,
  ListBookingsQuery,
  ListBookingsResponse,
} from '@repo/contracts';
import { AppError } from '../../lib/errors.js';
import { orgsService } from '../orgs/service.js';
import {
  bookingsRepository,
  type BookingViewRecord,
  type TransitionBookingParams,
} from './repository.js';

export type BookingCaller = {
  userId: string;
  name: string;
  phoneNumber: string | null;
  phoneNumberVerified: boolean;
  isBanned: boolean;
  activeOrgId: string | null;
};

function toResponse(row: BookingViewRecord): BookingResponse {
  return {
    id: row.id,
    organization: {
      id: row.organizationId,
      name: row.organizationName,
      slug: row.organizationSlug,
    },
    designerProfile: {
      id: row.designerProfileId,
      displayName: row.designerDisplayName,
      // The slug /d/{slug} actually canonicalises to. Sending the org slug when a custom
      // one exists produces a link that works but immediately redirects. #282 lands
      // publicPortfolioSlug() with this same rule — collapse onto it once that merges.
      slug: row.designerPortfolioSlug ?? row.organizationSlug,
      logoUrl: null,
    },
    requester: {
      id: row.requesterId,
      name: row.requesterName,
      email: row.requesterEmail,
      phoneNumber: row.requesterPhoneNumber,
    },
    referredProject:
      row.referredProjectId && row.referredProjectTitle && row.referredProjectSlug
        ? {
            id: row.referredProjectId,
            title: row.referredProjectTitle,
            slug: row.referredProjectSlug,
            coverImageUrl: null,
          }
        : null,
    preferredSlots: row.preferredSlots,
    confirmedSlot: row.confirmedSlot,
    message: row.message,
    status: row.status,
    cancelledBy: row.cancelledBy,
    cancelledByUserId: row.cancelledByUserId,
    cancelReason: row.cancelReason,
    requestedAt: row.requestedAt.toISOString(),
    confirmedAt: row.confirmedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    reviewEligible: row.status === 'completed',
  };
}

function statusFilter(status: ListBookingsQuery['status']): BookingStatus | undefined {
  return status === 'all' ? undefined : status;
}

function assertActiveCaller(caller: BookingCaller): void {
  if (caller.isBanned) throw AppError.forbidden('Account suspended');
}

function requireActiveOrganization(caller: BookingCaller): string {
  if (!caller.activeOrgId) {
    throw AppError.unprocessable('No active organization selected');
  }
  return caller.activeOrgId;
}

/**
 * Guard the designer-side transitions on a booking the caller has already loaded.
 *
 * A caller with no active organization 404s rather than 422ing: the alternative
 * distinguishes an existing booking id from an unknown one, since `findById`
 * answers 404 for the latter. "No active organization selected" also describes the
 * session rather than this request, which is the wrong thing to tell the client here.
 */
async function assertDesignerWriteAccess(
  booking: BookingViewRecord,
  caller: BookingCaller,
): Promise<void> {
  if (!caller.activeOrgId) throw AppError.notFound('Booking not found');
  const organizationId = caller.activeOrgId;
  if (booking.organizationId !== organizationId) {
    throw AppError.notFound('Booking not found');
  }
  if (!(await orgsService.isWriter(caller.userId, organizationId))) {
    throw AppError.forbidden('Organization write access required');
  }
}

function slotsMatch(left: BookingSlot, right: BookingSlot): boolean {
  return left.date === right.date && left.window === right.window;
}

async function transitionOrConflict(
  params: TransitionBookingParams,
): Promise<BookingResponse> {
  const transitioned = await bookingsRepository.transition(params);
  if (!transitioned) {
    throw AppError.conflict('Booking changed; refresh and try again');
  }
  return toResponse(transitioned);
}

export const bookingsService = {
  async create(input: CreateBookingInput, caller: BookingCaller): Promise<BookingResponse> {
    assertActiveCaller(caller);
    if (!caller.phoneNumber || !caller.phoneNumberVerified) {
      throw AppError.unprocessable('A verified phone number is required to book a consultation');
    }

    const result = await bookingsRepository.createWithLead({
      ...input,
      requesterId: caller.userId,
      requesterName: caller.name,
      requesterPhoneNumber: caller.phoneNumber,
    });

    switch (result.kind) {
      case 'designer_not_found':
        throw AppError.notFound('Designer profile not found');
      case 'designer_not_notifiable':
        throw AppError.unprocessable('Designer is not configured to receive consultations');
      case 'invalid_project':
        throw AppError.unprocessable('referredProjectId must be a published project by the designer');
      case 'open_limit_reached':
        throw AppError.conflict('You already have three open consultations with this designer');
      case 'created':
        return toResponse(result.booking);
    }
  },

  async listMine(
    query: ListBookingsQuery,
    caller: BookingCaller,
  ): Promise<ListBookingsResponse> {
    assertActiveCaller(caller);
    const { items, total } = await bookingsRepository.list({
      requesterId: caller.userId,
      status: statusFilter(query.status),
      limit: query.limit,
      offset: (query.page - 1) * query.limit,
    });
    return {
      items: items.map(toResponse),
      page: query.page,
      limit: query.limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / query.limit),
    };
  },

  async listInbox(
    query: ListBookingsQuery,
    caller: BookingCaller,
  ): Promise<ListBookingsResponse> {
    assertActiveCaller(caller);
    const organizationId = requireActiveOrganization(caller);
    if (!(await orgsService.isMember(caller.userId, organizationId))) {
      throw AppError.forbidden();
    }
    const { items, total } = await bookingsRepository.list({
      organizationId,
      status: statusFilter(query.status),
      limit: query.limit,
      offset: (query.page - 1) * query.limit,
    });
    return {
      items: items.map(toResponse),
      page: query.page,
      limit: query.limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / query.limit),
    };
  },

  async confirm(
    id: string,
    input: ConfirmBookingInput,
    caller: BookingCaller,
  ): Promise<BookingResponse> {
    assertActiveCaller(caller);
    const booking = await bookingsRepository.findById(id);
    if (!booking) throw AppError.notFound('Booking not found');
    await assertDesignerWriteAccess(booking, caller);
    if (booking.status !== 'requested') {
      throw AppError.conflict('Only requested consultations can be confirmed');
    }
    if (!booking.preferredSlots.some((slot) => slotsMatch(slot, input.confirmedSlot))) {
      throw AppError.unprocessable('Confirmed slot must be one of the requester preferences');
    }
    return transitionOrConflict({
      id,
      expectedStatus: 'requested',
      toStatus: 'confirmed',
      confirmedSlot: input.confirmedSlot,
    });
  },

  async complete(id: string, caller: BookingCaller): Promise<BookingResponse> {
    assertActiveCaller(caller);
    const booking = await bookingsRepository.findById(id);
    if (!booking) throw AppError.notFound('Booking not found');
    await assertDesignerWriteAccess(booking, caller);
    if (booking.status !== 'confirmed') {
      throw AppError.conflict('Only confirmed consultations can be completed');
    }
    return transitionOrConflict({
      id,
      expectedStatus: 'confirmed',
      toStatus: 'completed',
    });
  },

  async cancel(
    id: string,
    input: CancelBookingInput,
    caller: BookingCaller,
  ): Promise<BookingResponse> {
    assertActiveCaller(caller);
    const booking = await bookingsRepository.findById(id);
    if (!booking) throw AppError.notFound('Booking not found');

    const cancelledBy = booking.requesterId === caller.userId ? 'requester' : 'designer';
    if (cancelledBy === 'designer') {
      await assertDesignerWriteAccess(booking, caller);
    }

    if (booking.status !== 'requested' && booking.status !== 'confirmed') {
      throw AppError.conflict('Completed or cancelled consultations cannot be cancelled');
    }

    if (cancelledBy === 'designer') {
      if (!input.reason) {
        throw AppError.unprocessable('A reason is required when a designer cancels');
      }
    }

    return transitionOrConflict({
      id,
      expectedStatus: booking.status,
      toStatus: 'cancelled',
      cancelledBy,
      cancelledByUserId: caller.userId,
      cancelReason: input.reason ?? null,
    });
  },
};
