'use client';

import { useEffect } from 'react';
import { env } from '@/env';
import { authClient } from '@/lib/auth-client';

const SNOOZED_UNTIL_KEY = 'tickif:google-one-tap-snoozed-until:v1';
const SNOOZE_MS = 30 * 24 * 60 * 60_000;

/**
 * Google's "Sign in with Google" One Tap prompt. Render it only where the server has
 * already found no session.
 *
 * Under FedCM, Google reports a closed prompt and one it couldn't show (no Google session,
 * origin not allowed) the same way, as a skipped moment with no reason. Either one snoozes
 * the prompt on this browser for 30 days, on top of Google's own cooldown. A snooze rather
 * than a permanent flag, so a visitor who wasn't signed in to Google yet gets another chance.
 * A blocked script ends the same way: no prompt, and the normal sign-in still works.
 */
export function GoogleOneTap() {
  useEffect(() => {
    if (!env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || isSnoozed()) return;
    authClient
      .oneTap({
        callbackURL: continuationPath(window.location),
        onPromptNotification: (notification) => {
          if (notification?.isSkippedMoment?.()) snooze();
        },
      })
      .catch(() => {
        // Nothing to show. The login page is the fallback.
      });
  }, []);

  return null;
}

/**
 * After One Tap signs someone in, the server-rendered login page decides where they go:
 * onboarding for a new account, otherwise back to the page they were on.
 */
export function continuationPath({ pathname, search }: Pick<Location, 'pathname' | 'search'>) {
  const currentPath = `${pathname}${search}`;
  if (pathname === '/login') return currentPath;
  return `/login?${new URLSearchParams({ callbackURL: currentPath }).toString()}`;
}

function isSnoozed(): boolean {
  try {
    return Number(window.localStorage.getItem(SNOOZED_UNTIL_KEY)) > Date.now();
  } catch {
    return false;
  }
}

function snooze() {
  try {
    window.localStorage.setItem(SNOOZED_UNTIL_KEY, String(Date.now() + SNOOZE_MS));
  } catch {
    // Google's own cooldown still applies.
  }
}
