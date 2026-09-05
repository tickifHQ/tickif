'use client';

import Link from 'next/link';
import { Button } from '@repo/ui/components/button';

export default function SettingsError({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 px-5 py-10">
      <h1 className="text-xl font-medium">Unable to load personal settings</h1>
      <p role="alert">Please try again. Your saved details have not been changed.</p>
      <Button onClick={reset}>Try again</Button>
      <Link href="/home">Back to My Tickif</Link>
    </main>
  );
}
