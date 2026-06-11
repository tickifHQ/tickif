'use client';

import { useState, useEffect, useRef } from 'react';

/**
 * Scroll-gate component for public feed.
 *
 * Scroll tracking approach: accumulates downward scroll distance.
 * Every 400px of cumulative downward scroll = 1 scroll-unit.
 * Upward scroll does NOT decrement the counter.
 * Once the limit is reached, the gate is irreversible for this mount lifecycle.
 *
 * This component does NOT render on the server (hydration-safe).
 * The parent layout decides whether to mount it based on auth state.
 */

const SCROLL_UNIT_PX = 400;

function getLimit(): number {
  const raw = process.env.NEXT_PUBLIC_SCROLL_GATE_LIMIT;
  if (raw === undefined || raw === '') return 5;
  const parsed = parseInt(raw, 10);
  // 0 = gate disabled (never trigger)
  if (isNaN(parsed) || parsed < 0) return 5;
  return parsed;
}

export function ScrollGate() {
  const [gated, setGated] = useState(false);
  const [mounted, setMounted] = useState(false);
  const cumulativeRef = useRef(0);
  const lastScrollYRef = useRef(0);
  const unitsRef = useRef(0);

  useEffect(() => {
    setMounted(true);
    lastScrollYRef.current = window.scrollY;

    const limit = getLimit();
    // 0 = gate disabled
    if (limit === 0) return;

    function handleScroll() {
      const currentY = window.scrollY;
      const delta = currentY - lastScrollYRef.current;
      lastScrollYRef.current = currentY;

      // Only accumulate downward scroll
      if (delta > 0) {
        cumulativeRef.current += delta;
        const newUnits = Math.floor(cumulativeRef.current / SCROLL_UNIT_PX);

        if (newUnits > unitsRef.current) {
          unitsRef.current = newUnits;
          if (newUnits >= limit) {
            setGated(true);
          }
        }
      }
    }

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Never render on the server
  if (!mounted) return null;
  if (!gated) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-neutral-900/80 backdrop-blur-sm"
      aria-modal="true"
      role="dialog"
      aria-label="Sign in required"
    >
      <div className="mx-4 max-w-sm rounded-xl bg-white p-8 text-center shadow-2xl">
        <h2 className="text-xl font-semibold text-neutral-900">
          Sign in to keep browsing
        </h2>
        <p className="mt-2 text-sm text-neutral-500">
          Create a free account to explore all projects and designer profiles.
        </p>
        <a
          href="/login"
          className="mt-6 inline-block w-full rounded-md bg-neutral-900 px-6 py-3 text-sm font-medium text-white hover:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:ring-offset-2"
        >
          Sign in
        </a>
      </div>
    </div>
  );
}
