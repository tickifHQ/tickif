'use client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@repo/ui/components/button';
export function AdminVisibilityErrorState({
  message,
  resetHref,
}: {
  message: string;
  resetHref?: string;
}) {
  const router = useRouter();
  return (
    <div role="alert" className="space-y-3 rounded-xl border border-destructive/30 p-5">
      <p className="font-medium">Admin data unavailable</p>
      <p>{message}</p>
      <Button variant="outline" onClick={() => router.refresh()}>
        Try again
      </Button>
      {resetHref ? (
        <Link href={resetHref} className="ml-4 text-sm text-primary hover:underline">
          Reset filters
        </Link>
      ) : null}
    </div>
  );
}
