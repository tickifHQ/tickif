import {
  listEnquiriesResponseSchema,
  listSavedProjectsResponseSchema,
  personalAccountSchema,
} from '@repo/contracts';
import { api } from '@/lib/api';
import { handleApiResponse } from '@/lib/api-response';
import { parsePhoneNumberFromString } from 'libphonenumber-js';

/** Mask the sign-in number without exposing a generated phone-auth email. */
export function maskedAccountPhone(value: string | null): string | null {
  const phone = value ? parsePhoneNumberFromString(value) : null;
  if (!phone?.isValid()) return null;
  const number = String(phone.nationalNumber);
  return `+${phone.countryCallingCode} ${number.slice(0, Math.min(5, number.length - 5))} •••${number.slice(-2)}`;
}

/** Read only the caller's existing data through the shared contracts and typed client. */
export async function fetchAccountActivity(signal: AbortSignal) {
  const options = { init: { cache: 'no-store' as const, signal } };
  const [saved, enquiries] = await Promise.allSettled([
    api.api['saved-projects']
      .$get({ query: { page: 1, limit: 1 } }, options)
      .then((response) =>
        handleApiResponse(
          response,
          listSavedProjectsResponseSchema,
          'Could not load saved projects.',
        ),
      ),
    api.api.enquiries.mine
      .$get({ query: { status: 'all', page: 1, limit: 1 } }, options)
      .then((response) =>
        handleApiResponse(response, listEnquiriesResponseSchema, 'Could not load enquiries.'),
      ),
  ]);
  return {
    saved: saved.status === 'fulfilled' ? saved.value.total : null,
    enquiries: enquiries.status === 'fulfilled' ? enquiries.value.total : null,
  };
}

export async function fetchAccountAddress(signal: AbortSignal): Promise<string | null> {
  const response = await api.api['personal-account'].me.$get(
    {},
    { init: { cache: 'no-store', signal } },
  );
  const account = await handleApiResponse(
    response,
    personalAccountSchema,
    'Could not load account details.',
  );
  return account.address;
}
