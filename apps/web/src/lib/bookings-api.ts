import {
  bookingResponseSchema,
  listBookingsResponseSchema,
  type BookingStatus,
  type CancelBookingInput,
  type ConfirmBookingInput,
  type CreateBookingInput,
  type ListBookingsQuery,
} from '@repo/contracts';
import { api } from '@/lib/api';
import { handleApiResponse } from '@/lib/api-response';

export async function fetchConsultations(
  query: ListBookingsQuery,
  scope: 'mine' | 'inbox',
  cookie: string,
) {
  const input = {
    query: { status: query.status, page: String(query.page), limit: String(query.limit) },
  };
  const options = { headers: { cookie }, init: { cache: 'no-store' as const } };
  const response =
    scope === 'mine'
      ? await api.api.bookings.mine.$get(input, options)
      : await api.api.bookings.$get(input, options);
  return handleApiResponse(response, listBookingsResponseSchema, 'Could not load consultations.');
}
export async function requestConsultation(input: CreateBookingInput) {
  return handleApiResponse(
    await api.api.bookings.$post({ json: input }),
    bookingResponseSchema,
    'Could not request your consultation.',
  );
}
export async function confirmConsultation(
  id: string,
  expectedStatus: BookingStatus,
  input: ConfirmBookingInput,
) {
  return handleApiResponse(
    await api.api.bookings[':id'].confirm.$post({
      param: { id },
      query: { expectedStatus },
      json: input,
    }),
    bookingResponseSchema,
    'Could not confirm the consultation.',
  );
}
export async function cancelConsultation(
  id: string,
  expectedStatus: BookingStatus,
  input: CancelBookingInput,
) {
  return handleApiResponse(
    await api.api.bookings[':id'].cancel.$post({
      param: { id },
      query: { expectedStatus },
      json: input,
    }),
    bookingResponseSchema,
    'Could not cancel the consultation.',
  );
}
export async function completeConsultation(id: string, expectedStatus: BookingStatus) {
  return handleApiResponse(
    await api.api.bookings[':id'].complete.$post({ param: { id }, query: { expectedStatus } }),
    bookingResponseSchema,
    'Could not complete the consultation.',
  );
}
