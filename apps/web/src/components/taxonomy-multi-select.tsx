'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronsUpDown, Plus } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@repo/ui/components/dropdown-menu';
import { Input } from '@repo/ui/components/input';
import { Label } from '@repo/ui/components/label';
import { cn } from '@repo/ui/lib/utils';
import { RequiredFieldIndicator } from '@repo/ui/components/required-field-indicator';

type TaxonomyOption = { id: string; label: string };

export function TaxonomyMultiSelect({
  density = 'default',
  emptyLabel = 'No options available',
  error,
  extraSelectedCount = 0,
  id,
  label,
  labelHint,
  limit,
  onAddCustom,
  onRemoveCustom,
  onValuesChange,
  options,
  required = false,
  values,
  customValues = [],
  customAddLabel = 'Add a custom option',
  customInputPlaceholder = 'Enter a name',
}: {
  density?: 'compact' | 'default';
  emptyLabel?: string;
  error?: string;
  /**
   * Selections counted toward `limit` that live outside this control (e.g.
   * free-text custom cities sharing the same budget). Added to `values.length`
   * for the counter and the option-disable check. Defaults to 0, preserving the
   * standalone behaviour for every other usage.
   */
  extraSelectedCount?: number;
  id: string;
  label: string;
  labelHint?: string;
  limit?: number;
  /**
   * When provided, a "+ <customAddLabel>" action renders as the last item in
   * the dropdown and opens an inline text input to add a free-text value. The
   * parent owns where that value is stored (it does not enter `values`). Omit
   * this prop for a plain taxonomy-only select — the default for every other
   * usage.
   */
  onAddCustom?: (value: string) => void;
  /** Deselect handler for an already-added custom value. Required alongside `customValues`. */
  onRemoveCustom?: (value: string) => void;
  required?: boolean;
  values: string[];
  options: readonly TaxonomyOption[];
  onValuesChange: (values: string[]) => void;
  /**
   * Free-text values that live outside the taxonomy `options` but display as
   * selected items inside this same control (trigger summary + checked rows in
   * the list). Defaults to `[]`, preserving standalone behaviour elsewhere.
   */
  customValues?: string[];
  customAddLabel?: string;
  customInputPlaceholder?: string;
}) {
  const selected = options.filter((option) => values.includes(option.id));
  const summaryLabels = [...selected.map((option) => option.label), ...customValues];
  const summary = summaryLabels.length > 0 ? summaryLabels.join(', ') : 'None selected';
  const errorId = `${id}-error`;
  const counterId = `${id}-counter`;
  const selectedCount = values.length + customValues.length + extraSelectedCount;
  const describedBy =
    [limit === undefined ? null : counterId, error ? errorId : null].filter(Boolean).join(' ') ||
    undefined;
  const atLimit = limit !== undefined && selectedCount >= limit;

  const [customEntry, setCustomEntry] = useState(false);
  const [customDraft, setCustomDraft] = useState('');
  const customInputRef = useRef<HTMLInputElement>(null);

  // Focus the inline input once it opens.
  useEffect(() => {
    if (customEntry) customInputRef.current?.focus();
  }, [customEntry]);

  function toggle(optionId: string) {
    onValuesChange(
      values.includes(optionId)
        ? values.filter((value) => value !== optionId)
        : [...values, optionId],
    );
  }

  function submitCustom() {
    if (!onAddCustom) return;
    const trimmed = customDraft.trim();
    if (!trimmed) return;
    onAddCustom(trimmed);
    setCustomDraft('');
    // Keep the inline input open so several custom entries can be added in a
    // row, but collapse it once the shared limit is reached.
    if (limit !== undefined && selectedCount + 1 >= limit) setCustomEntry(false);
  }

  return (
    <div className={cn('grid', density === 'compact' ? 'gap-1' : 'gap-2')}>
      <div className="flex items-center justify-between gap-3">
        <Label
          htmlFor={id}
          className={cn(
            required && 'gap-0',
            density === 'compact' && 'text-[13px] font-medium leading-relaxed',
          )}
        >
          {label}
          {required ? <RequiredFieldIndicator /> : null}{' '}
          {labelHint ? (
            <span className="font-normal text-muted-foreground">({labelHint})</span>
          ) : null}
        </Label>
        {limit === undefined ? null : (
          <span id={counterId} className="text-xs text-muted-foreground">
            {selectedCount}/{limit}
          </span>
        )}
      </div>
      <DropdownMenu
        modal={false}
        onOpenChange={(open) => {
          if (!open) {
            setCustomEntry(false);
            setCustomDraft('');
          }
        }}
      >
        <DropdownMenuTrigger asChild>
          <button
            id={id}
            type="button"
            aria-label={`${label}: ${summary}`}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            className={cn(
              'flex w-full items-center justify-between gap-3 rounded-md border border-input bg-background text-left shadow-xs outline-none transition-colors hover:bg-accent/30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              density === 'compact' ? 'h-8 px-2 text-[13px] font-medium' : 'h-10 px-3 py-2 text-sm',
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
                  disabled={!checked && limit !== undefined && selectedCount >= limit}
                  onCheckedChange={() => toggle(option.id)}
                  onSelect={(event) => event.preventDefault()}
                  className={cn(density === 'compact' && 'text-[13px]')}
                >
                  {option.label}
                </DropdownMenuCheckboxItem>
              );
            })
          ) : onAddCustom ? null : (
            <div className="px-3 py-5 text-center text-xs text-muted-foreground">{emptyLabel}</div>
          )}

          {customValues.map((value) => (
            <DropdownMenuCheckboxItem
              key={`custom:${value}`}
              checked
              onCheckedChange={() => onRemoveCustom?.(value)}
              onSelect={(event) => event.preventDefault()}
              className={cn(density === 'compact' && 'text-[13px]')}
            >
              {value}
            </DropdownMenuCheckboxItem>
          ))}

          {onAddCustom ? (
            <>
              {options.length > 0 || customValues.length > 0 ? <DropdownMenuSeparator /> : null}
              {customEntry ? (
                <div className="p-1">
                  <Input
                    ref={customInputRef}
                    value={customDraft}
                    onChange={(event) => setCustomDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        submitCustom();
                      }
                      if (event.key === 'Escape') {
                        event.preventDefault();
                        setCustomEntry(false);
                        setCustomDraft('');
                      }
                    }}
                    placeholder={customInputPlaceholder}
                    maxLength={100}
                    aria-label={customAddLabel}
                    className={cn('h-8', density === 'compact' && 'text-[13px]')}
                  />
                </div>
              ) : (
                <DropdownMenuItem
                  disabled={atLimit}
                  onSelect={(event) => {
                    event.preventDefault();
                    setCustomEntry(true);
                  }}
                  className={cn(density === 'compact' && 'text-[13px]')}
                >
                  <Plus className="size-4" aria-hidden="true" />
                  {customAddLabel}
                </DropdownMenuItem>
              )}
            </>
          ) : null}
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
