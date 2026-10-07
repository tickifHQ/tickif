import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '../lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap py-0 text-sm leading-none font-medium transition-[color,background-color,border-color,box-shadow,transform] active:translate-y-px motion-reduce:transform-none motion-reduce:transition-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*="size-"])]:size-4 [&_svg]:shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-button-primary hover:bg-primary-hover',
        soft: 'bg-primary-soft text-primary-soft-foreground hover:bg-primary-soft/90',
        emphasis:
          'border border-border bg-foreground text-background shadow-sm hover:bg-foreground/90',
        destructive: 'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90',
        neutral:
          'bg-button-neutral text-button-neutral-foreground shadow-button-neutral hover:bg-button-neutral-hover',
        inverted:
          'bg-button-inverted text-button-inverted-foreground shadow-button-inverted hover:bg-button-inverted-hover',
        fancy:
          'border border-button-fancy-border bg-button-fancy text-button-fancy-foreground shadow-button-fancy [background-image:var(--button-fancy-background)] hover:bg-button-fancy-hover',
        outline: 'border border-border-strong bg-transparent text-foreground hover:bg-muted',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'text-foreground hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-11 px-5',
        compact: 'h-8 gap-1.5 px-2.5 text-[13px]/none [&_svg]:size-[15px]',
        fancy: 'h-10 gap-1 px-2.5 text-sm/none [&_svg]:size-[15px]',
        sm: 'h-9 px-3',
        xs: 'h-8 gap-1.5 px-2.5',
        lg: 'h-12.5 px-6 text-base/none',
        xl: 'h-16 px-8 text-base/none',
        icon: 'size-11',
        'icon-sm': 'size-8',
      },
      shape: {
        pill: 'rounded-full',
        rounded: 'rounded-lg',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
      shape: 'pill',
    },
  },
);

export type ButtonVariantProps = VariantProps<typeof buttonVariants>;

type ButtonProps = ComponentProps<'button'> &
  ButtonVariantProps & {
    asChild?: boolean;
  };

export function Button({
  asChild = false,
  className,
  shape,
  size,
  variant,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : 'button';

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, shape, size, className }))}
      {...props}
    />
  );
}

export { buttonVariants };
