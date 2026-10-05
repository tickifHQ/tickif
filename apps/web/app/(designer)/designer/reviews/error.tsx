'use client';
import { Button } from '@repo/ui/components/button';
import { useReportBoundaryError } from '@/lib/use-report-boundary-error';
export default function Error({ error, reset }: { error?: Error; reset: () => void }) {
  useReportBoundaryError(error, 'reviews.boundary');
  return (
    <section className="flex flex-col gap-4 p-6">
      <h1 className="text-2xl font-medium">Could not load reviews</h1>
      <p role="alert">Check your active organization and try again.</p>
      <Button onClick={reset}>Try again</Button>
    </section>
  );
}
