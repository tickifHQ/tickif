import 'server-only';
import { headers } from 'next/headers';
import { followingListSchema } from '@repo/contracts';
import { api } from '@/lib/api';
import { handleApiResponse } from '@/lib/api-response';

export async function getFollowing(page = 1) {
  const response = await api.api.following.$get(
    { query: { page, limit: 20 } },
    { init: { cache: 'no-store', headers: { cookie: (await headers()).get('cookie') ?? '' } } },
  );
  return handleApiResponse(response, followingListSchema, 'Could not load followed studios.');
}
