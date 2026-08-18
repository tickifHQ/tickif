'use client';

import { ChevronsUpDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@repo/ui/components/dropdown-menu';
import { Label } from '@repo/ui/components/label';
import { cn } from '@repo/ui/lib/utils';

type TaxonomyOption = { id: string; label: string };

export function TaxonomyMultiSelect({
  density = 'default',
  emptyLabel = 'No options available',
  error,
  id,
  label,
  labelHint,
  limit,
  onValuesChange,
  options,
  values,
}: {
  density?: 'compact' | 'default';
  emptyLabel?: string;
  error?: string;
  id: string;
  label: string;
  labelHint?: string;
  limit?: number;
  values: string[];
  options: readonly TaxonomyOption[];
  onValuesChange: (values: string[]) => void;
}) {
  const selected = options.filter((option) => values.includes(option.id));
  const summary =
    selected.length > 0 ? selected.map((option) => option.label).join(', ') : 'None selected';
  const errorId = `${id}-error`;
  const counterId = `${id}-counter`;
  const describedBy = [limit === undefined ? null : counterId, error ? errorId : null]
    .filter(Boolean)
    .join(' ') || undefined;

  function toggle(optionId: string) {
    onValuesChange(
      values.includes(optionId)
        ? values.filter((value) => value !== optionId)
        : [...values, optionId],
    );
  }

  return (
    <div className={cn('grid', density === 'compact' ? 'gap-1' : 'gap-2')}>
      <div className="flex items-center justify-between gap-3">
        <Label
          htmlFor={id}
          className={cn(density === 'compact' && 'text-[13px] font-medium leading-relaxed')}
        >
          {label}{' '}
          {labelHint ? (
            <span className="font-normal text-muted-foreground">({labelHint})</span>
          ) : null}
        </Label>
        {limit === undefined ? null : (
          <span id={counterId} className="text-xs text-muted-foreground">
            {values.length}/{limit}
          </span>
        )}
      </div>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button
            id={id}
            type="button"
            aria-label={`${label}: ${summary}`}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            className={cn(
              'flex w-full items-center justify-between gap-3 rounded-md border border-input bg-background text-left shadow-xs outline-none transition-colors hover:bg-accent/30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              density === 'compact'
                ? 'h-8 px-2 text-[13px] font-medium'
                : 'h-10 px-3 py-2 text-sm',
            )}
          >
            <span className="min-w-0 truncate">{summary}</span>
            <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          sideOffset={2}
          collisionPadding={8}
          className="max-h-72 w-[var(--radix-dropdown-menu-trigger-width)] overflow-y-auto"
        >
          {options.length > 0 ? (
            options.map((option) => {
              const checked = values.includes(option.id);
              return (
                <DropdownMenuCheckboxItem
                  key={option.id}
                  checked={checked}
                  disabled={!checked && limit !== undefined && values.length >= limit}
                  onCheckedChange={() => toggle(option.id)}
                  onSelect={(event) => event.preventDefault()}
                  className={cn(density === 'compact' && 'text-[13px]')}
                >
                  {option.label}
                </DropdownMenuCheckboxItem>
              );
            })
          ) : (
            <div className="px-3 py-5 text-center text-xs text-muted-foreground">{emptyLabel}</div>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {error ? (
        <p id={errorId} className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
