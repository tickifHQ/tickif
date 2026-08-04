import { Lightbulb } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cn } from '../lib/utils';

export function TipCallout({ className, children, ...props }: ComponentProps<'div'>) {
  return (
    <div {...props} data-slot="tip-callout" className={cn('flex gap-1', className)}>
      <span aria-hidden="true" className="w-1 shrink-0 self-stretch rounded-full bg-primary" />
      <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-border bg-primary/5 px-4 py-3">
        <Lightbulb aria-hidden="true" className="size-4 shrink-0 text-primary" />
        <span className="text-xs font-semibold leading-[1.6] text-primary">Tip</span>
        <span className="text-xs font-medium leading-[1.6] text-muted-foreground">{children}</span>
      </div>
    </div>
  );
}
