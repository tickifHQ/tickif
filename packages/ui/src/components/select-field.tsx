'use client';

import type { ComponentProps } from 'react';
import { useId } from 'react';
import { cn } from '../lib/utils';
import { Label } from './label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './select';

export type SelectFieldOption = {
  disabled?: boolean;
  label: string;
  value: string;
};

type SelectFieldProps = Omit<
  ComponentProps<typeof SelectTrigger>,
  'onChange' | 'value' | 'defaultValue' | 'children' | 'type' | 'name'
> &
  Pick<ComponentProps<typeof Select>, 'required' | 'autoComplete'> & {
    allowEmpty?: boolean;
    error?: string;
    label: string;
    name?: string;
    onValueChange: (value: string) => void;
    options: readonly SelectFieldOption[];
    placeholder: string;
    value: string;
  };

export function SelectField({
  allowEmpty = false,
  autoComplete,
  className,
  disabled,
  error,
  form,
  label,
  name,
  onValueChange,
  options,
  placeholder,
  required,
  value,
  ...props
}: SelectFieldProps) {
  const generatedId = useId();
  const selectId = props.id ?? generatedId;
  const errorId = `${selectId}-error`;
  // Radix reserves an empty item value for its placeholder. Keep the public
  // empty-string contract and use a collision-free internal clearing item.
  let emptyItemValue = `${generatedId}-empty`;
  while (options.some((option) => option.value === emptyItemValue)) emptyItemValue += '-empty';
  const describedBy =
    [props['aria-describedby'], error ? errorId : undefined].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <Label htmlFor={selectId} className="text-sm font-medium text-foreground">
        {label}
      </Label>
      <Select
        value={value}
        onValueChange={(nextValue) => onValueChange(nextValue === emptyItemValue ? '' : nextValue)}
        disabled={disabled}
        required={required}
        name={name}
        form={form}
        autoComplete={autoComplete}
      >
        <SelectTrigger
          {...props}
          id={selectId}
          aria-invalid={error ? true : props['aria-invalid']}
          aria-describedby={describedBy}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {allowEmpty ? <SelectItem value={emptyItemValue}>{placeholder}</SelectItem> : null}
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value} disabled={option.disabled}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      {error ? (
        <p id={errorId} className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
