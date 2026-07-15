import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '../lib/utils';

const frameVariants = cva(
  'border bg-card text-card-foreground shadow-sm',
  {
    variants: {
      variant: {
        default: 'border-border/80',
        muted: 'border-border/80 bg-muted/30',
        accent: 'border-primary/15 bg-primary/5',
        ghost: 'border-transparent bg-transparent shadow-none',
      },
      radius: {
        md: 'rounded-lg',
        lg: 'rounded-xl',
        xl: 'rounded-2xl',
        full: 'rounded-3xl',
      },
      padding: {
        none: 'p-0',
        sm: 'p-4',
        md: 'p-5',
        lg: 'p-6',
      },
    },
    defaultVariants: {
      variant: 'default',
      radius: 'lg',
      padding: 'none',
    },
  },
);

type FrameProps = ComponentProps<'div'> & VariantProps<typeof frameVariants>;

export function Frame({
  className,
  padding,
  radius,
  variant,
  ...props
}: FrameProps) {
  return (
    <div
      data-slot="frame"
      className={cn(frameVariants({ variant, radius, padding, className }))}
      {...props}
    />
  );
}

export function FrameHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="frame-header" className={cn('px-5 py-5 sm:px-6', className)} {...props} />;
}

export function FrameSection({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="frame-section"
      className={cn('border-t border-border/80 px-5 py-5 first:border-t-0 sm:px-6', className)}
      {...props}
    />
  );
}

export function FrameFooter({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="frame-footer" className={cn('border-t border-border/80 px-5 py-4 sm:px-6', className)} {...props} />;
}

export { frameVariants };
