'use client';

import { useId, useState } from 'react';
import { Combobox } from '@base-ui/react/combobox';
import { Check, ChevronDown, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { controlStyles, controlTextStyles } from '../lib/control-styles';
import { Button } from './button';
import { Label } from './label';

export type SearchableSelectOption = { value: string; label: string };

export function SearchableSelect({
  label,
  placeholder,
  options,
  value,
  onValueChange,
  onSearchChange,
  disabled = false,
  isLoading = false,
  hasMore = false,
  onLoadMore,
  error,
  onRetry,
  emptyLabel = 'No matching options.',
  className,
}: {
  label: string;
  placeholder: string;
  options: readonly SearchableSelectOption[];
  value: string;
  onValueChange: (value: string) => void;
  onSearchChange: (query: string) => void;
  disabled?: boolean;
  isLoading?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
  error?: string | null;
  onRetry?: () => void;
  emptyLabel?: string;
  className?: string;
}) {
  const inputId = useId();
  const errorId = `${inputId}-error`;
  const selected = options.find((option) => option.value === value) ?? null;
  const [inputValue, setInputValue] = useState('');

  return (
    <div className={cn('flex min-w-0 flex-col gap-2', className)}>
      <Label htmlFor={inputId}>{label}</Label>
      <Combobox.Root<SearchableSelectOption>
        items={options}
        value={selected}
        inputValue={selected?.label ?? inputValue}
        filter={null}
        disabled={disabled}
        isItemEqualToValue={(item, selectedItem) => item.value === selectedItem.value}
        onValueChange={(option) => {
          onValueChange(option?.value ?? '');
          setInputValue('');
        }}
        onInputValueChange={(query, details) => {
          if (details.reason !== 'input-change') return;
          setInputValue(query);
          onSearchChange(query);
          if (value) onValueChange('');
        }}
      >
        <Combobox.InputGroup className="relative">
          <Combobox.Input
            id={inputId}
            placeholder={placeholder}
            maxLength={200}
            aria-describedby={error ? errorId : undefined}
            aria-invalid={!!error || undefined}
            className={cn(controlStyles, controlTextStyles, 'h-11 px-3.5 py-0 pr-10')}
          />
          <Combobox.Trigger
            aria-label={`Show ${label.toLowerCase()} options`}
            className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-lg text-muted-foreground disabled:pointer-events-none disabled:opacity-60"
          >
            <ChevronDown className="size-4" aria-hidden="true" />
          </Combobox.Trigger>
        </Combobox.InputGroup>
        <Combobox.Portal>
          <Combobox.Positioner sideOffset={4} className="z-50 w-(--anchor-width)">
            <Combobox.Popup className="overflow-hidden rounded-popover border border-border bg-popover p-1.5 text-popover-foreground shadow-popover">
              <Combobox.List className="max-h-64 overflow-y-auto">
                {(option: SearchableSelectOption) => (
                  <Combobox.Item
                    key={option.value}
                    value={option}
                    disabled={isLoading || !!error}
                    className="flex min-h-10 cursor-default items-center justify-between gap-3 rounded-md px-3 py-2 text-sm outline-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-disabled:opacity-50"
                  >
                    <span>{option.label}</span>
                    <Combobox.ItemIndicator>
                      <Check className="size-4" aria-hidden="true" />
                    </Combobox.ItemIndicator>
                  </Combobox.Item>
                )}
              </Combobox.List>
              {!options.length && !isLoading && !error ? (
                <p className="px-3 py-4 text-sm text-muted-foreground">{emptyLabel}</p>
              ) : null}
              {isLoading ? (
                <p
                  aria-live="polite"
                  className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground"
                >
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  Loading options…
                </p>
              ) : null}
              {error ? (
                <div className="px-3 py-2">
                  <p id={errorId} role="alert" className="text-sm text-destructive">
                    {error}
                  </p>
                  {onRetry ? (
                    <Button type="button" variant="ghost" size="compact" onClick={onRetry}>
                      Retry loading options
                    </Button>
                  ) : null}
                </div>
              ) : null}
              {hasMore && onLoadMore ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="compact"
                  className="mt-1 w-full"
                  disabled={isLoading || !!error}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={onLoadMore}
                >
                  Load more options
                </Button>
              ) : null}
            </Combobox.Popup>
          </Combobox.Positioner>
        </Combobox.Portal>
      </Combobox.Root>
    </div>
  );
}
