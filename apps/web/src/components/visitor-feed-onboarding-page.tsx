'use client';

import { useRouter } from 'next/navigation';
import { VisitorFeedOnboarding } from '@/components/visitor-feed-onboarding';

export function VisitorFeedOnboardingPage() {
  const router = useRouter();
  return (
    <VisitorFeedOnboarding
      onComplete={(href) => {
        router.replace(href);
        router.refresh();
      }}
    />
  );
}
