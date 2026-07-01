import { cache } from 'react';
import { headers } from 'next/headers';
import {
  currentProfileResponseSchema,
  type CurrentProfileResponse,
} from '@repo/contracts';
import { api } from '@/lib/api';

async function getRequestCookie() {
  const reqHeaders = await headers();
  return reqHeaders.get('cookie');
}

export const getCurrentDesignerProfile = cache(async (): Promise<CurrentProfileResponse | null> => {
  const cookie = await getRequestCookie();
  if (!cookie) return null;

  try {
    const response = await api.api.profiles.me.$get({}, { headers: { cookie } });
    if (!response.ok) return null;

    const payload = await response.json();
    const parsed = currentProfileResponseSchema.safeParse(payload);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
});
