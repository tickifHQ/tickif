'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { savedProjectStateSchema } from '@repo/contracts';

/** Keep the server-rendered list, count and pagination in sync after successful saves. */
export function SavedProjectsSync({ userId }: { userId: string }) {
  const router = useRouter();

  useEffect(() => {
    function onSaved(event: Event) {
      if (!(event instanceof CustomEvent) || event.detail?.userId !== userId) return;
      if (savedProjectStateSchema.safeParse(event.detail?.project).success) router.refresh();
    }
    window.addEventListener('tickif:project-saved', onSaved);
    return () => window.removeEventListener('tickif:project-saved', onSaved);
  }, [router, userId]);

  return null;
}
