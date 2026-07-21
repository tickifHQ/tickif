import { cache } from 'react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { currentProfileResponseSchema, type CurrentProfileResponse } from '@repo/contracts';
import { api } from '@/lib/api';

async function getRequestCookie() {
  const reqHeaders = await headers();
  return reqHeaders.get('cookie');
}

type CurrentDesignerProfileResult =
  | { status: 'ok'; data: CurrentProfileResponse }
  | { status: 'unauthenticated' | 'forbidden' | 'unavailable' };

const fetchCurrentDesignerProfile = cache(async (): Promise<CurrentDesignerProfileResult> => {
  const cookie = await getRequestCookie();
  if (!cookie) return { status: 'unauthenticated' };

  try {
    const response = await api.api.profiles.me.$get({}, { headers: { cookie } });
    if (response.status === 401) return { status: 'unauthenticated' };
    if ([403, 404, 422].includes(response.status)) return { status: 'forbidden' };
    if (!response.ok) return { status: 'unavailable' };

    const payload = await response.json();
    const parsed = currentProfileResponseSchema.safeParse(payload);
    return parsed.success ? { status: 'ok', data: parsed.data } : { status: 'unavailable' };
  } catch {
    return { status: 'unavailable' };
  }
});

export async function getCurrentDesignerProfile(): Promise<CurrentProfileResponse | null> {
  const result = await fetchCurrentDesignerProfile();
  return result.status === 'ok' ? result.data : null;
}

export async function requireCurrentDesignerProfile(): Promise<CurrentProfileResponse> {
  const result = await fetchCurrentDesignerProfile();
  if (result.status !== 'ok') {
    if (result.status === 'unauthenticated') redirect('/login');
    if (result.status === 'forbidden') redirect('/unauthorized');
    throw new Error('Unable to load the active designer organization');
  }
  return result.data;
}
