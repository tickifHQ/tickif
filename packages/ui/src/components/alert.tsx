import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '../lib/utils';

const alertVariants = cva(
  'relative grid w-full grid-cols-[0_1fr] items-start gap-y-0.5 rounded-lg border px-4 py-3 text-sm has-[>svg]:grid-cols-[calc(--spacing(4))_1fr] has-[>svg]:gap-x-3 [&>svg]:size-4 [&>svg]:translate-y-0.5',
  {
    variants: {
      variant: {
        default: 'bg-card text-card-foreground',
        destructive: 'border-destructive/30 bg-destructive/5 text-destructive [&>svg]:text-destructive',
        success: 'border-success/30 bg-success/5 text-success [&>svg]:text-success',
        warning: 'border-warning/40 bg-warning/10 text-warning-foreground [&>svg]:text-warning-foreground',
        info: 'border-info/30 bg-info/5 text-info [&>svg]:text-info',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

type AlertProps = ComponentProps<'div'> & VariantProps<typeof alertVariants>;

export function Alert({ className, variant, ...props }: AlertProps) {
  return (
    <div data-slot="alert" role="alert" className={cn(alertVariants({ variant, className }))} {...props} />
  );
}

export function AlertTitle({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-title"
      className={cn('col-start-2 min-h-4 font-medium tracking-tight', className)}
      {...props}
    />
  );
}

export function AlertDescription({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-description"
      className={cn('col-start-2 grid justify-items-start gap-1 text-sm opacity-90 [&_p]:leading-relaxed', className)}
      {...props}
    />
  );
}

export { alertVariants };
