'use client';

import { Button } from '@repo/ui/components/button';

export default function SavedProjectsError({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-2xl">Could not load saved projects</h1>
      <p role="alert" className="mt-3 text-muted-foreground">
        Please try loading your saved projects again.
      </p>
      <Button type="button" className="mt-5" onClick={reset}>
        Try again
      </Button>
    </main>
  );
}
