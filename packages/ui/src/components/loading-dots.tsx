import { Circle } from 'lucide-react';
import { cn } from '../lib/utils';

/** Decorative progress dots; the owning status region supplies accessible copy. */
export function LoadingDots({ className }: { className?: string }) {
  return (
    <span className={cn('flex items-center gap-1.5 text-primary', className)} aria-hidden>
      <Circle className="size-2 fill-current" viewBox="2 2 20 20" strokeWidth={0} />
      <Circle className="size-2 fill-current opacity-60" viewBox="2 2 20 20" strokeWidth={0} />
      <Circle className="size-2 fill-current opacity-30" viewBox="2 2 20 20" strokeWidth={0} />
    </span>
  );
}
