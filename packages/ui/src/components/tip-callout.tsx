import { Lightbulb } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cn } from '../lib/utils';

type TipCalloutProps = ComponentProps<'div'> & {
  variant?: 'info' | 'tip';
};

export function TipCallout({ className, children, variant = 'tip', ...props }: TipCalloutProps) {
  const isInfo = variant === 'info';

  return (
    <div {...props} data-slot="tip-callout" className={cn('flex gap-1', className)}>
      <span
        aria-hidden="true"
        data-slot="tip-callout-indicator"
        className={cn('w-1 shrink-0 self-stretch rounded-full', isInfo ? 'bg-info' : 'bg-primary')}
      />
      <div
        data-slot="tip-callout-content"
        className={cn(
          'flex min-w-0 flex-1 items-center border',
          isInfo
            ? 'rounded-l-sm rounded-r-lg border-info/40 bg-info/10 px-3 py-1.5'
            : 'gap-2 rounded-xl border-border bg-primary/5 px-4 py-3',
        )}
      >
        {isInfo ? null : (
          <>
            <Lightbulb aria-hidden="true" className="size-4 shrink-0 text-primary" />
            <span className="text-xs font-semibold leading-[1.6] text-primary">Tip</span>
          </>
        )}
        <span
          className={cn(
            'text-xs leading-[1.6]',
            isInfo ? 'font-normal text-info' : 'font-medium text-muted-foreground',
          )}
        >
          {children}
        </span>
      </div>
    </div>
  );
}
