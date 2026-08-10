import { cache } from 'react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  currentProfileResponseSchema,
  profileCompletionResponseSchema,
  type CurrentProfileResponse,
  type ProfileCompletionResponse,
} from '@repo/contracts';
import { api } from '@/lib/api';

const getRequestCookie = cache(async () => {
  const reqHeaders = await headers();
  return reqHeaders.get('cookie');
});

type CurrentDesignerProfileResult =
  | { status: 'ok'; data: CurrentProfileResponse }
  | { status: 'unauthenticated' | 'missing-active-organization' | 'forbidden' | 'unavailable' };

export type ProfileCompletionResult =
  | { ok: true; data: ProfileCompletionResponse }
  | { ok: false; data: null; message: string };

const fetchCurrentDesignerProfile = cache(async (): Promise<CurrentDesignerProfileResult> => {
  const cookie = await getRequestCookie();
  if (!cookie) return { status: 'unauthenticated' };

  try {
    const response = await api.api.profiles.me.$get({}, { headers: { cookie } });
    if (response.status === 401) return { status: 'unauthenticated' };
    if (response.status === 422) return { status: 'missing-active-organization' };
    if ([403, 404].includes(response.status)) return { status: 'forbidden' };
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
    if (result.status === 'missing-active-organization') redirect('/designer/select-studio');
    if (result.status === 'forbidden') redirect('/unauthorized');
    throw new Error('Unable to load the active designer organization');
  }
  return result.data;
}

export const getProfileCompletion = cache(async (): Promise<ProfileCompletionResult> => {
  const cookie = await getRequestCookie();
  const unavailable = {
    ok: false,
    data: null,
    message: 'Could not load profile completion.',
  } as const;
  if (!cookie) return unavailable;

  try {
    const response = await api.api.profiles.me.completion.$get({}, { headers: { cookie } });
    if (!response.ok) return unavailable;
    const parsed = profileCompletionResponseSchema.safeParse(await response.json());
    return parsed.success ? { ok: true, data: parsed.data } : unavailable;
  } catch {
    return unavailable;
  }
});
