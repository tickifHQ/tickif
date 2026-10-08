'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Preserve existing review deep links without adding Tickif UI to the default portfolio. */
export function LegacyProfileReviewEntry() {
  const router = useRouter();
  useEffect(() => {
    const openReview = () => {
      if (window.location.hash !== '#tickif-reviews') return;
      const url = new URL(window.location.href);
      if (url.searchParams.get('review') === 'tickif') return;
      url.searchParams.set('review', 'tickif');
      router.replace(`${url.pathname}${url.search}${url.hash}`);
    };
    openReview();
    window.addEventListener('hashchange', openReview);
    return () => window.removeEventListener('hashchange', openReview);
  }, [router]);
  return null;
}
