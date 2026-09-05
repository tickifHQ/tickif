'use client';
import { Button } from '@repo/ui/components/button';
export function ConsultationsError({ reset }: { reset: () => void }) {
  return (
    <div className="flex flex-col items-start gap-4 p-8">
      <h1 className="text-xl font-medium">Could not load consultations</h1>
      <p role="alert">Please try again. Your requests have not been changed.</p>
      <Button onClick={reset}>Retry consultations</Button>
    </div>
  );
}
