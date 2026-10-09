import 'server-only';
import { headers } from 'next/headers';
import { visitorFeedPreferencesResponseSchema } from '@repo/contracts';
import { api } from '@/lib/api';

export async function getVisitorFeedPreferences() {
  const response = await api.api.visitors.me['feed-preferences'].$get(
    {},
    {
      init: { headers: { cookie: (await headers()).get('cookie') ?? '' }, cache: 'no-store' },
    },
  );
  if (!response.ok) throw new Error('Could not load your feed preferences. Please try again.');
  return visitorFeedPreferencesResponseSchema.parse(await response.json());
}
