'use client';

import type { KeyboardEvent } from 'react';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { cn } from '../lib/utils';
import { Input } from './input';
import { Label } from './label';

export type TagComboboxOption = {
  label: string;
  value: string;
};

type TagComboboxProps = {
  allowCreate?: boolean;
  className?: string;
  createLabel?: (query: string) => string;
  emptyLabel?: string;
  label?: string;
  labelHint?: string;
  maxSuggestions?: number;
  onAddTag: (tag: string) => void;
  onRemoveTag: (tag: string) => void;
  onValueChange: (value: string) => void;
  options?: TagComboboxOption[];
  placeholder?: string;
  tags: string[];
  value: string;
};

function normalizeTag(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

export function TagCombobox({
  allowCreate = true,
  className,
  createLabel = (query) => `Create "${query}"`,
  emptyLabel = 'No matching tags',
  label = 'Search tags',
  labelHint = 'Optional',
  maxSuggestions = 12,
  onAddTag,
  onRemoveTag,
  onValueChange,
  options = [],
  placeholder = 'Type to search or create',
  tags,
  value,
}: TagComboboxProps) {
  const inputId = useId();
  const listboxId = useId();
  const [focused, setFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [menuRect, setMenuRect] = useState<{ left: number; top: number; width: number } | null>(null);

  const normalizedValue = normalizeTag(value);
  const selectedValues = useMemo(() => new Set(tags.map((tag) => tag.toLowerCase())), [tags]);
  const filteredOptions = useMemo(() => {
    const query = normalizedValue.toLowerCase();

    return options
      .filter((option) => !selectedValues.has(option.label.toLowerCase()) && !selectedValues.has(option.value.toLowerCase()))
      .filter((option) => {
        if (!query) return true;
        return option.label.toLowerCase().includes(query) || option.value.toLowerCase().includes(query);
      })
      .slice(0, maxSuggestions);
  }, [maxSuggestions, normalizedValue, options, selectedValues]);

  const canCreate =
    allowCreate &&
    normalizedValue.length > 0 &&
    !selectedValues.has(normalizedValue.toLowerCase()) &&
    !options.some(
      (option) =>
        option.label.toLowerCase() === normalizedValue.toLowerCase() ||
        option.value.toLowerCase() === normalizedValue.toLowerCase(),
    );

  const menuItems = [
    ...filteredOptions.map((option) => ({ type: 'option' as const, label: option.label, value: option.label })),
    ...(canCreate ? [{ type: 'create' as const, label: createLabel(normalizedValue), value: normalizedValue }] : []),
  ];
  const showMenu = focused && (menuItems.length > 0 || normalizedValue.length > 0 || options.length > 0);
  const clampedActiveIndex =
    activeIndex === null ? null : Math.min(activeIndex, Math.max(menuItems.length - 1, 0));

  const updateMenuRect = useCallback(() => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setMenuRect({
      left: rect.left,
      top: rect.bottom + 4,
      width: rect.width,
    });
  }, []);

  useEffect(() => {
    if (!showMenu) {
      setMenuRect(null);
      return;
    }

    updateMenuRect();
    window.addEventListener('resize', updateMenuRect);
    window.addEventListener('scroll', updateMenuRect, true);

    return () => {
      window.removeEventListener('resize', updateMenuRect);
      window.removeEventListener('scroll', updateMenuRect, true);
    };
  }, [showMenu, updateMenuRect]);

  useEffect(() => {
    if (!showMenu || menuItems.length === 0 || clampedActiveIndex === null) return;
    itemRefs.current[clampedActiveIndex]?.scrollIntoView({ block: 'nearest' });
  }, [clampedActiveIndex, menuItems.length, showMenu]);

  function addTag(tag: string) {
    const next = normalizeTag(tag);
    if (!next) return;
    if (selectedValues.has(next.toLowerCase())) {
      onValueChange('');
      setActiveIndex(null);
      return;
    }
    onAddTag(next);
    onValueChange('');
    setActiveIndex(null);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((current) => {
        if (menuItems.length === 0) return null;
        if (current === null) return 0;
        return Math.min(current + 1, menuItems.length - 1);
      });
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((current) => {
        if (menuItems.length === 0) return null;
        if (current === null) return 0;
        return Math.max(current - 1, 0);
      });
      return;
    }

    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      if (normalizedValue.length === 0 && clampedActiveIndex === null) return;
      const selected =
        clampedActiveIndex === null ? menuItems[0] : menuItems[clampedActiveIndex];
      addTag(selected?.value ?? normalizedValue);
      return;
    }

    if (event.key === 'Escape') {
      setFocused(false);
      setActiveIndex(null);
      return;
    }

    if (event.key === 'Backspace' && !value && tags.length > 0) {
      onRemoveTag(tags[tags.length - 1]!);
    }
  }

  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={inputId} className="text-sm font-medium text-foreground">
        {label} {labelHint ? <span className="text-muted-foreground">({labelHint})</span> : null}
      </Label>
      <div ref={containerRef}>
        <div className="rounded-md border border-input bg-background px-3 py-2 shadow-xs transition-[border-color,box-shadow] focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
          {tags.length > 0 ? (
            <div className="mb-2 flex flex-wrap gap-2">
              {tags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => onRemoveTag(tag)}
                  className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs text-foreground transition-colors hover:bg-accent"
                >
                  <span>{tag}</span>
                  <X className="size-3 text-muted-foreground" />
                </button>
              ))}
            </div>
          ) : null}
          <Input
            id={inputId}
            role="combobox"
            aria-controls={listboxId}
            aria-expanded={showMenu}
            aria-autocomplete="list"
            value={value}
            onChange={(event) => {
              onValueChange(event.target.value);
              setActiveIndex(normalizeTag(event.target.value).length > 0 ? 0 : null);
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => window.setTimeout(() => setFocused(false), 120)}
            onKeyDown={handleKeyDown}
            className="h-8 border-0 px-0 py-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
            placeholder={placeholder}
          />
        </div>

        {showMenu && menuRect ? (
          <div
            id={listboxId}
            role="listbox"
            className="fixed z-50 overflow-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-lg"
            style={{ left: menuRect.left, top: menuRect.top, width: menuRect.width }}
          >
            <div className="max-h-40 overflow-y-auto">
              {menuItems.length > 0 ? (
                menuItems.map((item, index) => (
                  <button
                    key={`${item.type}-${item.value}`}
                    ref={(element) => {
                      itemRefs.current[index] = element;
                    }}
                    type="button"
                    role="option"
                    aria-selected={index === clampedActiveIndex}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => addTag(item.value)}
                    className={cn(
                      'flex w-full items-center rounded-sm px-2 py-1.5 text-left text-sm transition-colors',
                      index === clampedActiveIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-accent hover:text-accent-foreground',
                    )}
                  >
                    {item.label}
                  </button>
                ))
              ) : (
                <div className="px-2 py-3 text-center text-xs text-muted-foreground">{emptyLabel}</div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
