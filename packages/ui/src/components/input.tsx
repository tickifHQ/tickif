import type { ComponentProps } from 'react';
import { cn } from '../lib/utils';
import { controlStyles, controlTextStyles } from '../lib/control-styles';

export function Input({ className, type, ...props }: ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        controlStyles,
        controlTextStyles,
        'flex h-11 px-3.5 py-2.5',
        'file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground',
        className,
      )}
      {...props}
    />
  );
}
