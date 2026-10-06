'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import { LoginCard } from '@/components/login-card';
import { env } from '@/env';

/**
 * Scroll-responsive sign-in prompt for anonymous public pages.
 *
 * Eligible pages reveal the prompt around the midpoint of their scrollable
 * distance. On shorter pages, the reveal ends later so the complete responsive
 * card can still begin below the first viewport before it scrolls into view.
 * The card begins below the viewport at a document-relative offset, so normal
 * page scrolling carries it upward at the same speed. Once centered, it pins
 * in place. Upward scrolling reverses the same path.
 * An explicit dismissal hides the prompt immediately and starts one shared
 * cooldown for every public route and browser tab on this origin.
 */

const REVEAL_PAGE_RATIO = 0.5;
const DISMISS_COOLDOWN_MS = 5 * 60_000;
const DISMISSED_UNTIL_KEY = 'tickif:scroll-gate-dismissed-until:v2';
const BACKDROP_MAX_OPACITY = 0.6;
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

type GateGeometry = {
  eligible: boolean;
  hasScrollRange: boolean;
  revealDistance: number;
};

function measureGateGeometry(cardHeight: number): GateGeometry {
  const viewportHeight = window.innerHeight;
  const scrollableDistance = Math.max(document.documentElement.scrollHeight - viewportHeight, 0);
  const hasScrollRange = scrollableDistance > 0;
  const minimumRevealDistance = Math.ceil((viewportHeight + cardHeight) / 2);
  const revealDistance = hasScrollRange
    ? Math.max(Math.floor(scrollableDistance * REVEAL_PAGE_RATIO), minimumRevealDistance)
    : 0;

  return {
    hasScrollRange,
    revealDistance,
    eligible: cardHeight > 0 && scrollableDistance >= minimumRevealDistance,
  };
}

function readDismissedUntil(now: number): number {
  try {
    const storedUntil = Number(window.localStorage.getItem(DISMISSED_UNTIL_KEY));
    if (Number.isFinite(storedUntil) && storedUntil > now) {
      return Math.min(storedUntil, now + DISMISS_COOLDOWN_MS);
    }
  } catch {
    // The in-memory timestamp still protects the current mounted layout.
  }
  return 0;
}

function getFocusableElements(panel: HTMLElement): HTMLElement[] {
  return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) =>
      !element.closest('[inert], [hidden], [aria-hidden="true"]') &&
      window.getComputedStyle(element).visibility !== 'hidden',
  );
}

export function ScrollGate() {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [suppressed, setSuppressed] = useState(true);
  const [hasScrollRange, setHasScrollRange] = useState(false);
  const [geometryEligible, setGeometryEligible] = useState(false);
  const [measuredPathname, setMeasuredPathname] = useState<string | null>(null);
  const gateRef = useRef<HTMLDivElement | null>(null);
  const backdropRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const cardHeightRef = useRef(0);
  const distanceRef = useRef(0);
  const revealDistanceRef = useRef(0);
  const revealDistanceLockedRef = useRef(false);
  const geometryEligibleRef = useRef(false);
  const lastScrollYRef = useRef(0);
  const dismissedUntilRef = useRef(0);
  const reducedMotionRef = useRef(false);
  const animationFrameRef = useRef<number | null>(null);
  const dialogActiveRef = useRef(false);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const inertSiblingsRef = useRef(new Map<HTMLElement, boolean>());

  const setDialogActive = useCallback((active: boolean) => {
    if (dialogActiveRef.current === active) return;

    const gate = gateRef.current;
    const panel = panelRef.current;
    if (active && (!gate || !panel)) return;
    dialogActiveRef.current = active;

    if (active && gate && panel) {
      previousFocusRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      for (const sibling of document.body.children) {
        if (!(sibling instanceof HTMLElement) || sibling === gate) continue;
        inertSiblingsRef.current.set(sibling, sibling.hasAttribute('inert'));
        sibling.setAttribute('inert', '');
      }
      panel.setAttribute('aria-modal', 'true');
      (getFocusableElements(panel)[0] ?? panel).focus({ preventScroll: true });
      return;
    }

    panel?.removeAttribute('aria-modal');
    for (const [sibling, wasInert] of inertSiblingsRef.current) {
      if (!wasInert) sibling.removeAttribute('inert');
    }
    inertSiblingsRef.current.clear();
    const previousFocus = previousFocusRef.current;
    previousFocusRef.current = null;
    if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
  }, []);

  const paintProgress = useCallback(() => {
    const gate = gateRef.current;
    const backdrop = backdropRef.current;
    const panel = panelRef.current;
    if (!gate || !backdrop || !panel) return;

    const progress = clamp(distanceRef.current / Math.max(revealDistanceRef.current, 1), 0, 1);
    const interactive = progress >= 1;
    const visualProgress = reducedMotionRef.current ? (interactive ? 1 : 0) : progress;
    const panelOffset =
      reducedMotionRef.current && !interactive
        ? revealDistanceRef.current
        : Math.max(revealDistanceRef.current - distanceRef.current, 0);

    if (!interactive) setDialogActive(false);
    gate.dataset.scrollProgress = progress.toFixed(3);
    gate.setAttribute('aria-hidden', String(!interactive));
    backdrop.style.opacity = String(visualProgress * BACKDROP_MAX_OPACITY);
    backdrop.style.pointerEvents = interactive ? 'auto' : 'none';
    panel.inert = !interactive;
    panel.style.pointerEvents = interactive ? 'auto' : 'none';
    panel.style.transform = `translate3d(0, ${panelOffset}px, 0)`;
    if (interactive) setDialogActive(true);
  }, [setDialogActive]);

  const schedulePaint = useCallback(() => {
    if (animationFrameRef.current !== null) return;

    animationFrameRef.current = window.requestAnimationFrame(() => {
      animationFrameRef.current = null;
      paintProgress();
    });
  }, [paintProgress]);

  const resetProgress = useCallback(() => {
    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    distanceRef.current = 0;
    revealDistanceLockedRef.current = false;
    paintProgress();
  }, [paintProgress]);

  const syncGeometry = useCallback(() => {
    if (revealDistanceLockedRef.current) return;

    const geometry = measureGateGeometry(cardHeightRef.current);
    revealDistanceRef.current = geometry.revealDistance;
    geometryEligibleRef.current = geometry.eligible;
    setHasScrollRange(geometry.hasScrollRange);
    setGeometryEligible(geometry.eligible);
    setMeasuredPathname(pathname);

    if (!geometry.eligible) {
      distanceRef.current = 0;
      paintProgress();
      return;
    }

    distanceRef.current = Math.max(window.scrollY, 0);
    lastScrollYRef.current = window.scrollY;
    paintProgress();
  }, [paintProgress, pathname]);

  const dismiss = useCallback(() => {
    const dismissedUntil = Date.now() + DISMISS_COOLDOWN_MS;
    dismissedUntilRef.current = dismissedUntil;
    try {
      window.localStorage.setItem(DISMISSED_UNTIL_KEY, String(dismissedUntil));
    } catch {
      // Keep the in-memory cooldown when storage is unavailable.
    }
    setSuppressed(true);
    resetProgress();
    lastScrollYRef.current = window.scrollY;
  }, [resetProgress]);

  useEffect(() => {
    setMounted(true);
    resetProgress();
    cardHeightRef.current = 0;
    geometryEligibleRef.current = false;
    setGeometryEligible(false);
    setMeasuredPathname(null);
    lastScrollYRef.current = window.scrollY;
    reducedMotionRef.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const now = Date.now();
    dismissedUntilRef.current = Math.max(dismissedUntilRef.current, readDismissedUntil(now));

    const limit = env.NEXT_PUBLIC_SCROLL_GATE_LIMIT;
    if (limit === 0) {
      setSuppressed(true);
      return;
    }

    setSuppressed(now < dismissedUntilRef.current);

    syncGeometry();
    const resizeObserver =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(syncGeometry);
    resizeObserver?.observe(document.documentElement);
    resizeObserver?.observe(document.body);

    function handleScroll() {
      const currentY = window.scrollY;
      const delta = currentY - lastScrollYRef.current;
      lastScrollYRef.current = currentY;

      if (Date.now() < dismissedUntilRef.current || delta === 0) return;

      setSuppressed(false);
      if (!geometryEligibleRef.current || revealDistanceRef.current === 0) return;

      revealDistanceLockedRef.current = true;

      // Preserve distance beyond the reveal threshold so the card remains
      // pinned until upward scrolling crosses the same reveal boundary.
      distanceRef.current = Math.max(distanceRef.current + delta, 0);
      schedulePaint();
    }

    function handleStorage(event: StorageEvent) {
      if (event.key !== DISMISSED_UNTIL_KEY) return;

      const storedUntil = Number(event.newValue);
      if (Number.isFinite(storedUntil) && storedUntil > Date.now()) {
        dismissedUntilRef.current = Math.min(storedUntil, Date.now() + DISMISS_COOLDOWN_MS);
        setSuppressed(true);
        resetProgress();
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (!dialogActiveRef.current || event.defaultPrevented) return;
      if (event.target instanceof Element && event.target.closest('[role="menu"]')) return;

      if (event.key === 'Escape') {
        dismiss();
        return;
      }

      if (event.key !== 'Tab' || !panelRef.current) return;
      const focusable = getFocusableElements(panelRef.current);
      const first = focusable[0];
      const last = focusable.at(-1);
      const focused = document.activeElement;
      if (!first || !last) {
        event.preventDefault();
        panelRef.current.focus({ preventScroll: true });
      } else if (event.shiftKey && (focused === first || !panelRef.current.contains(focused))) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && (focused === last || !panelRef.current.contains(focused))) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    }

    function handleResize() {
      // Keep an in-progress or interactive prompt stable so an orientation
      // change cannot dismiss the form or discard entered authentication data.
      if (revealDistanceLockedRef.current) return;
      const measuredPanelHeight = panelRef.current?.getBoundingClientRect().height ?? 0;
      cardHeightRef.current = measuredPanelHeight > 0 ? measuredPanelHeight : 0;
      syncGeometry();
    }

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleResize);
    window.addEventListener('storage', handleStorage);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      setDialogActive(false);
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('keydown', handleKeyDown);
      resizeObserver?.disconnect();
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [dismiss, pathname, resetProgress, schedulePaint, setDialogActive, syncGeometry]);

  useEffect(() => {
    if (
      !mounted ||
      suppressed ||
      !hasScrollRange ||
      measuredPathname !== pathname ||
      !panelRef.current
    ) {
      return;
    }

    const panel = panelRef.current;
    function syncCardHeight() {
      const nextCardHeight = panel.getBoundingClientRect().height;
      if (nextCardHeight <= 0) return;
      cardHeightRef.current = nextCardHeight;
      syncGeometry();
    }

    syncCardHeight();
    const resizeObserver =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(syncCardHeight);
    resizeObserver?.observe(panel);
    return () => resizeObserver?.disconnect();
  }, [
    geometryEligible,
    hasScrollRange,
    measuredPathname,
    mounted,
    pathname,
    suppressed,
    syncGeometry,
  ]);

  if (!mounted || suppressed || !hasScrollRange || measuredPathname !== pathname) return null;

  if (!geometryEligible) {
    return createPortal(
      <div
        data-testid="scroll-signup-measurement"
        className="invisible pointer-events-none fixed inset-0 flex items-center justify-center p-4 sm:p-8"
        aria-hidden="true"
        inert
      >
        <div ref={panelRef} className="w-full max-w-3xl">
          <LoginCard onClose={dismiss} />
        </div>
      </div>,
      document.body,
    );
  }

  const progress = clamp(distanceRef.current / Math.max(revealDistanceRef.current, 1), 0, 1);
  const visualProgress = reducedMotionRef.current ? (progress >= 1 ? 1 : 0) : progress;
  const interactive = progress >= 1;
  const panelOffset = reducedMotionRef.current
    ? interactive
      ? 0
      : revealDistanceRef.current
    : Math.max(revealDistanceRef.current - distanceRef.current, 0);

  return createPortal(
    <div
      ref={gateRef}
      data-testid="scroll-signup-gate"
      data-scroll-progress={progress.toFixed(3)}
      className="pointer-events-none fixed inset-0 z-50"
      aria-hidden={!interactive}
    >
      <div
        ref={backdropRef}
        data-testid="scroll-signup-backdrop"
        className="absolute inset-0 bg-foreground will-change-opacity"
        style={{
          opacity: visualProgress * BACKDROP_MAX_OPACITY,
          pointerEvents: interactive ? 'auto' : 'none',
        }}
      />
      <div className="absolute inset-0 flex items-start justify-center overflow-y-auto p-4 sm:p-8">
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Sign in required"
          aria-modal={interactive}
          inert={!interactive}
          tabIndex={-1}
          className="my-auto w-full max-w-3xl will-change-transform"
          style={{
            pointerEvents: interactive ? 'auto' : 'none',
            transform: `translate3d(0, ${panelOffset}px, 0)`,
          }}
        >
          <LoginCard onClose={dismiss} />
        </div>
      </div>
    </div>,
    document.body,
  );
}
