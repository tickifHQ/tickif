'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Browsers may restore protected pages from the back/forward cache without
 * making a network request. Refreshing on restore reruns the server auth wall.
 */
export function ProtectedBfcacheGuard() {
  const router = useRouter();

  useEffect(() => {
    function handlePageShow(event: PageTransitionEvent) {
      if (event.persisted) {
        router.refresh();
      }
    }

    window.addEventListener('pageshow', handlePageShow);
    return () => window.removeEventListener('pageshow', handlePageShow);
  }, [router]);

  return null;
}
