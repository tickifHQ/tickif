'use client';

import { useEffect, useState } from 'react';
import { Button } from '@repo/ui/components/button';
import { api } from '@/lib/api';
import { authClient } from '@/lib/auth-client';

/** A mounted public portfolio, not a server render or a prefetch, acknowledges updates. */
export function FollowingPortfolioVisit({
  designerProfileId,
  seenThrough,
}: {
  designerProfileId: string;
  seenThrough: string | null;
}) {
  const { data: session } = authClient.useSession();
  const [retry, setRetry] = useState(0);
  const [failed, setFailed] = useState(false);
  const userId = session?.user.id;
  useEffect(() => {
    if (!userId || !seenThrough) return;
    const controller = new AbortController();
    setFailed(false);
    void api.api.following[':designerProfileId'].seen
      .$post(
        { param: { designerProfileId }, json: { seenThrough } },
        { init: { signal: controller.signal } },
      )
      .then((response) => {
        if (!response.ok && response.status !== 403 && !controller.signal.aborted) setFailed(true);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [userId, designerProfileId, seenThrough, retry]);
  return failed ? (
    <div
      role="status"
      className="flex flex-wrap items-center gap-2 p-3 text-xs text-muted-foreground"
    >
      Could not mark studio updates as viewed.
      <Button
        type="button"
        variant="ghost"
        size="xs"
        onClick={() => setRetry((value) => value + 1)}
      >
        Retry
      </Button>
    </div>
  ) : null;
}
