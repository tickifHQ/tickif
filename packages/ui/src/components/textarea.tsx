import type { ComponentProps } from 'react';
import { cn } from '../lib/utils';
import { controlStyles, controlTextStyles } from '../lib/control-styles';

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        controlStyles,
        controlTextStyles,
        'flex min-h-28 px-3.5 py-3 leading-relaxed',
        className,
      )}
      {...props}
    />
  );
}
