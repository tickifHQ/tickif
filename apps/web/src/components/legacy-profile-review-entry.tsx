'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Preserve existing review deep links without adding Tickif UI to the default portfolio. */
export function LegacyProfileReviewEntry() {
  const router = useRouter();
  useEffect(() => {
    if (window.location.hash !== '#tickif-reviews') return;
    const url = new URL(window.location.href);
    url.searchParams.set('review', 'tickif');
    router.replace(`${url.pathname}${url.search}${url.hash}`);
  }, [router]);
  return null;
}
