import 'server-only';
import { headers } from 'next/headers';
import { visitorFeedPreferencesResponseSchema } from '@repo/contracts';
import { api } from '@/lib/api';
import { handleApiResponse } from '@/lib/api-response';

export async function getVisitorFeedPreferences() {
  const response = await api.api.visitors.me['feed-preferences'].$get(
    {},
    {
      init: { headers: { cookie: (await headers()).get('cookie') ?? '' }, cache: 'no-store' },
    },
  );
  return handleApiResponse(
    response,
    visitorFeedPreferencesResponseSchema,
    'Could not load your feed preferences. Please try again.',
  );
}
