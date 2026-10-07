import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '../lib/utils';

const badgeVariants = cva(
  'inline-flex w-fit shrink-0 items-center justify-center gap-1 align-middle whitespace-nowrap border leading-none font-medium transition-colors motion-reduce:transition-none [&_svg]:pointer-events-none [&_svg]:size-3',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        soft: 'border-transparent bg-primary-soft text-primary-soft-foreground',
        destructive: 'border-transparent bg-destructive text-destructive-foreground',
        success: 'border-transparent bg-success text-success-foreground',
        warning: 'border-transparent bg-warning text-warning-foreground',
        info: 'border-transparent bg-info text-info-foreground',
        outline: 'border-border text-foreground',
        inverse: 'border-transparent bg-surface-inverse text-surface-inverse-foreground',
        neutral: 'border-transparent bg-background text-foreground shadow-xs',
      },
      shape: {
        pill: 'rounded-full',
        square: 'rounded-sm',
      },
      size: {
        default: 'min-h-6 px-3 py-1 text-xs/none',
        compact: 'min-h-5 px-2 py-1 text-2xs/none',
      },
      textStyle: {
        default: '',
        code: 'font-mono tracking-wide',
      },
    },
    defaultVariants: {
      variant: 'default',
      shape: 'pill',
      size: 'default',
      textStyle: 'default',
    },
  },
);

type BadgeProps = ComponentProps<'span'> &
  VariantProps<typeof badgeVariants> & {
    asChild?: boolean;
  };

export function Badge({
  asChild = false,
  className,
  shape,
  size,
  textStyle,
  variant,
  ...props
}: BadgeProps) {
  const Comp = asChild ? Slot : 'span';

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant, shape, size, textStyle, className }))}
      {...props}
    />
  );
}

export { badgeVariants };
