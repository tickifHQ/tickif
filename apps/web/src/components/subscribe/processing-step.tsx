'use client';

import { Loader2 } from 'lucide-react';

export function ProcessingStep() {
  return (
    <div role="status" aria-live="polite" className="flex flex-col items-center justify-center py-12 text-center">
      <div className="relative flex size-20 items-center justify-center">
        <div className="absolute inset-0 animate-spin rounded-full border-4 border-muted border-t-primary" />
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
      <h2 className="mt-6 text-lg font-semibold text-foreground">
        Processing your payment...
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Please don&rsquo;t close this window.
      </p>
    </div>
  );
}
