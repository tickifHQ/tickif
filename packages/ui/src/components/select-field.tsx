import { ChevronsUpDown } from 'lucide-react';
import type { ComponentProps } from 'react';
import { useId } from 'react';
import { cn } from '../lib/utils';
import { Label } from './label';

export type SelectFieldOption = {
  label: string;
  value: string;
};

type SelectFieldProps = Omit<ComponentProps<'select'>, 'onChange'> & {
  label: string;
  onValueChange: (value: string) => void;
  options: readonly SelectFieldOption[];
  placeholder: string;
  value: string;
};

export function SelectField({
  className,
  label,
  onValueChange,
  options,
  placeholder,
  value,
  ...props
}: SelectFieldProps) {
  const generatedId = useId();
  const selectId = props.id ?? generatedId;

  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={selectId} className="text-sm font-medium text-foreground">{label}</Label>
      <div className="relative">
        <select
          id={selectId}
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          className={cn(
            'flex h-10 w-full appearance-none rounded-md border border-input bg-background px-3 py-2 pr-9 text-sm shadow-xs transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            !value && 'text-muted-foreground',
          )}
          {...props}
        >
          <option value="">{placeholder}</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronsUpDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      </div>
    </div>
  );
}
