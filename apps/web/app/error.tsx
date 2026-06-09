'use client';

import { useEffect } from 'react';

/** Root error boundary. Must be a Client Component per the App Router contract. */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface the error for observability wiring in a later epic.
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-4 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Something went wrong</h1>
      <p className="mt-2 text-neutral-600">
        An unexpected error occurred. You can try again, or come back later.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-6 rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-neutral-50 transition-colors hover:bg-neutral-700"
      >
        Try again
      </button>
    </main>
  );
}
