import { ChevronsUpDown } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cn } from '../lib/utils';
import { Input } from './input';

type NumberInputProps = Omit<ComponentProps<typeof Input>, 'type'>;

export function NumberInput({ className, ...props }: NumberInputProps) {
  return (
    <div className="relative w-full">
      <Input
        type="number"
        className={cn(
          'pr-9 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
          className,
        )}
        {...props}
      />
      <ChevronsUpDown
        data-slot="number-input-icon"
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  );
}
