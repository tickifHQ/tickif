'use client';

import { useEffect, useRef } from 'react';
import { mountProfileMotion } from '@/lib/profile-motion';

/** Enhances the server-rendered portfolio without moving its content to the client. */
export function ProfileMotion() {
  const anchor = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const root = anchor.current?.closest('main');
    if (root) return mountProfileMotion(root);
  }, []);
  return <span ref={anchor} hidden aria-hidden="true" />;
}
