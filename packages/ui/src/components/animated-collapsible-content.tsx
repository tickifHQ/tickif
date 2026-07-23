'use client';

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { cn } from '../lib/utils';

const TRANSITION_DURATION_MS = 300;
const UNMOUNT_FALLBACK_MS = TRANSITION_DURATION_MS + 20;

export function AnimatedCollapsibleContent({
  open,
  children,
  className,
}: {
  open: boolean;
  children: ReactNode;
  className?: string;
}) {
  const [shouldRender, setShouldRender] = useState(open);
  const [isVisible, setIsVisible] = useState(open);
  const isRenderedRef = useRef(open);
  const hasHandledInitialStateRef = useRef(false);
  const openFrameRef = useRef<number | null>(null);
  const openSecondFrameRef = useRef<number | null>(null);
  const closeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    function clearScheduledAnimationWork() {
      if (openFrameRef.current !== null) {
        window.cancelAnimationFrame(openFrameRef.current);
        openFrameRef.current = null;
      }

      if (openSecondFrameRef.current !== null) {
        window.cancelAnimationFrame(openSecondFrameRef.current);
        openSecondFrameRef.current = null;
      }

      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
    }

    if (!hasHandledInitialStateRef.current) {
      hasHandledInitialStateRef.current = true;
      return clearScheduledAnimationWork;
    }

    clearScheduledAnimationWork();

    if (open) {
      if (isRenderedRef.current) {
        setIsVisible(true);
        return clearScheduledAnimationWork;
      }

      isRenderedRef.current = true;
      setShouldRender(true);
      setIsVisible(false);

      openFrameRef.current = window.requestAnimationFrame(() => {
        openSecondFrameRef.current = window.requestAnimationFrame(() => {
          setIsVisible(true);
          openFrameRef.current = null;
          openSecondFrameRef.current = null;
        });
      });

      return clearScheduledAnimationWork;
    }

    setIsVisible(false);

    closeTimerRef.current = window.setTimeout(() => {
      isRenderedRef.current = false;
      setShouldRender(false);
      closeTimerRef.current = null;
    }, UNMOUNT_FALLBACK_MS);

    return clearScheduledAnimationWork;
  }, [open]);

  if (!shouldRender) return null;

  return (
    <div
      data-slot="animated-collapsible-content"
      className={cn(
        'grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none',
        isVisible ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
        className,
      )}
      onTransitionEnd={(event) => {
        if (event.currentTarget !== event.target || open) return;

        if (closeTimerRef.current !== null) {
          window.clearTimeout(closeTimerRef.current);
          closeTimerRef.current = null;
        }

        isRenderedRef.current = false;
        setShouldRender(false);
      }}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}
