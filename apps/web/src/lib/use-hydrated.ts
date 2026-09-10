'use client';

import { useSyncExternalStore } from 'react';

const subscribe = () => () => undefined;
const clientSnapshot = () => true;
const serverSnapshot = () => false;

/** Keep SSR and hydration consistent even when browser session data is cached. */
export function useHydrated() {
  return useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
}
