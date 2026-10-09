'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '../lib/utils';

/** Visible on the server; enhanced once an observer and motion preference are available. */
export function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<'static' | 'pending' | 'visible'>('static');

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    let observer: IntersectionObserver | undefined;
    let revealed = false;
    const update = () => {
      observer?.disconnect();
      if (preference.matches || revealed) {
        setPhase('static');
        return;
      }
      setPhase('pending');
      observer = new IntersectionObserver(
        (entries) => {
          if (!entries.some((entry) => entry.isIntersecting)) return;
          revealed = true;
          setPhase('visible');
          observer?.disconnect();
        },
        { threshold: 0.08 },
      );
      observer.observe(node);
    };
    update();
    preference.addEventListener('change', update);
    return () => {
      observer?.disconnect();
      preference.removeEventListener('change', update);
    };
  }, []);

  return (
    <div
      ref={ref}
      data-reveal={phase}
      className={cn('motion-reveal', className)}
      style={{ animationDelay: `${Math.min(Math.max(delay, 0), 400)}ms` }}
      onFocusCapture={() => setPhase('static')}
    >
      {children}
    </div>
  );
}
