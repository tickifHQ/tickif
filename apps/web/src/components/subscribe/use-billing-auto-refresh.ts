'use client';

import { useCallback, useEffect, useRef } from 'react';

/** Read-only synchronization; never retries a purchase or submits a plan change. */
export function useBillingAutoRefresh(
  refresh: () => Promise<void>,
  { enabled = true, urgent = false }: { enabled?: boolean; urgent?: boolean } = {},
) {
  const latest = useRef(refresh);
  const urgentRef = useRef(urgent);
  const inFlight = useRef<Promise<void> | null>(null);
  const runRef = useRef<(() => Promise<void>) | null>(null);
  const rescheduleRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    latest.current = refresh;
  }, [refresh]);
  useEffect(() => {
    urgentRef.current = urgent;
    rescheduleRef.current?.();
  }, [urgent]);

  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let failures = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const available = () => document.visibilityState !== 'hidden' && navigator.onLine !== false;
    const clearTimer = () => {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
    };
    const schedule = () => {
      clearTimer();
      if (stopped || !available()) return;
      const normalDelay = urgentRef.current ? 5_000 : 30_000;
      const delay = failures
        ? Math.min(60_000, Math.max(normalDelay, 10_000 * 2 ** Math.min(failures - 1, 3)))
        : normalDelay;
      timer = setTimeout(() => void run(), delay);
    };
    async function run() {
      if (stopped || !available()) return;
      clearTimer();
      if (inFlight.current) {
        await inFlight.current.catch(() => undefined);
        if (!stopped && timer === undefined) schedule();
        return;
      }
      const request = Promise.resolve().then(() => latest.current());
      inFlight.current = request;
      try {
        await request;
        failures = 0;
      } catch {
        failures += 1;
      } finally {
        if (inFlight.current === request) inFlight.current = null;
        schedule();
      }
    }
    const resume = () => {
      if (available()) void run();
      else clearTimer();
    };
    runRef.current = run;
    rescheduleRef.current = () => {
      if (!inFlight.current) schedule();
    };
    window.addEventListener('focus', resume);
    window.addEventListener('online', resume);
    window.addEventListener('offline', resume);
    document.addEventListener('visibilitychange', resume);
    void run();
    return () => {
      stopped = true;
      clearTimer();
      runRef.current = null;
      rescheduleRef.current = null;
      window.removeEventListener('focus', resume);
      window.removeEventListener('online', resume);
      window.removeEventListener('offline', resume);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [enabled]);

  return useCallback(() => runRef.current?.() ?? Promise.resolve(), []);
}
