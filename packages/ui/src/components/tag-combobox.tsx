'use client';

import type { ClipboardEvent, KeyboardEvent } from 'react';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '../lib/utils';
import { Label } from './label';

export type TagComboboxOption = {
  label: string;
  value: string;
};

type TagComboboxProps = {
  allowDuplicates?: boolean;
  className?: string;
  defaultValue?: string[];
  disabled?: boolean;
  hint?: string;
  label?: string;
  labelHint?: string;
  max?: number;
  /** Fires once per committed change: an add, a multi-tag paste, or a removal. */
  onChange?: (tags: string[]) => void;
  /** Suggestions shown while the field is focused. Omit for a plain tag input. */
  options?: TagComboboxOption[];
  placeholder?: string;
  separators?: string[];
  /** Runs on the trimmed, whitespace-collapsed candidate before it is added. */
  validate?: (tag: string, tags: string[]) => boolean;
  value?: string[];
};

type Rejection = { reason: 'duplicate' | 'limit' | 'invalid'; tag: string };

const MAX_SUGGESTIONS = 12;
const REJECTION_MS = 2400;
const FLASH_MS = 460;

function normalizeTag(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

function escapeForCharacterClass(value: string) {
  return value.replace(/[\\\]^-]/g, '\\$&');
}

function rejectionMessage({ reason, tag }: Rejection, max: number | undefined) {
  if (reason === 'limit') return `That's the limit of ${max} tags`;
  if (reason === 'duplicate') return `${tag} is already in the list`;
  return `${tag} is not allowed here`;
}

export function TagCombobox({
  allowDuplicates = false,
  className,
  defaultValue,
  disabled = false,
  hint = 'Enter adds · Backspace removes',
  label,
  labelHint,
  max,
  onChange,
  options = [],
  placeholder = 'Add a tag',
  separators = [','],
  validate,
  value,
}: TagComboboxProps) {
  const inputId = useId();
  const hintId = useId();
  const listboxId = useId();
  const [internalTags, setInternalTags] = useState<string[]>(() => defaultValue ?? []);
  const tags = value ?? internalTags;
  const [draft, setDraft] = useState('');
  const [highlighted, setHighlighted] = useState<number | null>(null);
  const [rejection, setRejection] = useState<Rejection | null>(null);
  const [flashedTag, setFlashedTag] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [focused, setFocused] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fieldRef = useRef<HTMLUListElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const blurTimeoutRef = useRef<number | null>(null);
  const rejectionTimeoutRef = useRef<number | null>(null);
  const flashTimeoutRef = useRef<number | null>(null);
  const [menuRect, setMenuRect] = useState<{ left: number; top: number; width: number } | null>(
    null,
  );

  const highlightedIndex = highlighted !== null && highlighted < tags.length ? highlighted : null;
  const splitPattern = useMemo(
    () => new RegExp(`[${separators.map(escapeForCharacterClass).join('')}\\n\\r\\t]+`),
    [separators],
  );

  const normalizedDraft = normalizeTag(draft);
  const selectedValues = useMemo(() => new Set(tags.map((tag) => tag.toLowerCase())), [tags]);
  const filteredOptions = useMemo(() => {
    const query = normalizedDraft.toLowerCase();

    return options
      .filter(
        (option) =>
          allowDuplicates ||
          (!selectedValues.has(option.label.toLowerCase()) &&
            !selectedValues.has(option.value.toLowerCase())),
      )
      .filter((option) => {
        if (!query) return true;
        return (
          option.label.toLowerCase().includes(query) || option.value.toLowerCase().includes(query)
        );
      })
      .slice(0, MAX_SUGGESTIONS);
  }, [allowDuplicates, normalizedDraft, options, selectedValues]);

  const canCreate =
    normalizedDraft.length > 0 &&
    !selectedValues.has(normalizedDraft.toLowerCase()) &&
    !options.some(
      (option) =>
        option.label.toLowerCase() === normalizedDraft.toLowerCase() ||
        option.value.toLowerCase() === normalizedDraft.toLowerCase(),
    );

  const menuItems = [
    ...filteredOptions.map((option) => ({
      type: 'option' as const,
      label: option.label,
      value: option.value,
    })),
    ...(canCreate
      ? [{ type: 'create' as const, label: `Create "${normalizedDraft}"`, value: normalizedDraft }]
      : []),
  ];
  const hasSuggestions = options.length > 0;
  const showMenu = hasSuggestions && focused && !disabled;
  const clampedActiveIndex =
    activeIndex === null ? null : Math.min(activeIndex, Math.max(menuItems.length - 1, 0));

  const updateMenuRect = useCallback(() => {
    const rect = fieldRef.current?.getBoundingClientRect();
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
  }, [showMenu, tags, updateMenuRect, draft]);

  useEffect(() => {
    setMounted(true);
    return () => {
      for (const timeout of [blurTimeoutRef, rejectionTimeoutRef, flashTimeoutRef]) {
        if (timeout.current !== null) window.clearTimeout(timeout.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!showMenu || menuItems.length === 0 || clampedActiveIndex === null) return;
    itemRefs.current[clampedActiveIndex]?.scrollIntoView({ block: 'nearest' });
  }, [clampedActiveIndex, menuItems.length, showMenu]);

  function emit(next: string[]) {
    if (value === undefined) setInternalTags(next);
    onChange?.(next);
  }

  function clearRejection() {
    if (rejectionTimeoutRef.current !== null) window.clearTimeout(rejectionTimeoutRef.current);
    rejectionTimeoutRef.current = null;
    setRejection(null);
  }

  function reject(next: Rejection) {
    if (rejectionTimeoutRef.current !== null) window.clearTimeout(rejectionTimeoutRef.current);
    setRejection(next);
    setAnnouncement(`${rejectionMessage(next, max)}.`);
    rejectionTimeoutRef.current = window.setTimeout(() => {
      rejectionTimeoutRef.current = null;
      setRejection(null);
    }, REJECTION_MS);

    if (next.reason !== 'duplicate') return;
    if (flashTimeoutRef.current !== null) window.clearTimeout(flashTimeoutRef.current);
    setFlashedTag(next.tag);
    flashTimeoutRef.current = window.setTimeout(() => {
      flashTimeoutRef.current = null;
      setFlashedTag(null);
    }, FLASH_MS);
  }

  /** Typed text that names a suggestion resolves to that suggestion's value. */
  function resolveCandidate(raw: string) {
    const candidate = normalizeTag(raw);
    const lower = candidate.toLowerCase();
    const option = options.find(
      (item) => item.label.toLowerCase() === lower || item.value.toLowerCase() === lower,
    );
    return option?.value ?? candidate;
  }

  /**
   * Adds every candidate it can in one change. The draft becomes `remainder`
   * only when something was added; otherwise the user's text stays put.
   */
  function commit(rawCandidates: string[], remainder = '') {
    const next = [...tags];
    let failure: Rejection | null = null;

    for (const raw of rawCandidates) {
      const candidate = resolveCandidate(raw);
      if (!candidate) continue;
      if (max !== undefined && next.length >= max) {
        failure = { reason: 'limit', tag: candidate };
        break;
      }
      if (!allowDuplicates) {
        const existing = next.find((tag) => tag.toLowerCase() === candidate.toLowerCase());
        if (existing) {
          failure = { reason: 'duplicate', tag: existing };
          continue;
        }
      }
      if (validate && !validate(candidate, next)) {
        failure = { reason: 'invalid', tag: candidate };
        continue;
      }
      next.push(candidate);
    }

    const added = next.length - tags.length;
    if (added > 0) {
      emit(next);
      setDraft(remainder);
      setHighlighted(null);
      setActiveIndex(null);
      clearRejection();
      setAnnouncement(
        `${added === 1 ? next[next.length - 1] : `${added} tags`} added, ${next.length} total.`,
      );
    }
    if (failure) reject(failure);
  }

  function removeAt(index: number) {
    const removed = tags[index];
    if (removed === undefined) return;
    const next = tags.filter((_, tagIndex) => tagIndex !== index);
    emit(next);
    setHighlighted(null);
    clearRejection();
    setAnnouncement(`${removed} removed, ${next.length} left.`);
  }

  function highlight(index: number) {
    setHighlighted(index);
    setAnnouncement(`${tags[index]} selected, press Backspace again to remove it.`);
  }

  function handleDraftChange(nextDraft: string) {
    setHighlighted(null);
    clearRejection();
    setFocused(true);

    const pieces = nextDraft.split(splitPattern);
    if (pieces.length > 1) {
      const remainder = pieces.pop() ?? '';
      commit(pieces, remainder);
      return;
    }

    setDraft(nextDraft);
    setActiveIndex(normalizeTag(nextDraft).length > 0 ? 0 : null);
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement>) {
    const text = event.clipboardData.getData('text');
    if (!splitPattern.test(text)) return;
    event.preventDefault();
    const input = event.currentTarget;
    const start = input.selectionStart ?? draft.length;
    const end = input.selectionEnd ?? draft.length;
    commit((draft.slice(0, start) + text + draft.slice(end)).split(splitPattern));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;

    if (event.key === 'ArrowDown' && showMenu) {
      event.preventDefault();
      setActiveIndex((current) => {
        if (menuItems.length === 0) return null;
        if (current === null) return 0;
        return Math.min(current + 1, menuItems.length - 1);
      });
      return;
    }

    if (event.key === 'ArrowUp' && showMenu) {
      event.preventDefault();
      setActiveIndex((current) => {
        if (menuItems.length === 0) return null;
        if (current === null) return 0;
        return Math.max(current - 1, 0);
      });
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      const activeItem =
        showMenu && clampedActiveIndex !== null ? menuItems[clampedActiveIndex] : undefined;
      if (activeItem) commit([activeItem.value]);
      else if (normalizedDraft) commit([draft]);
      return;
    }

    if (event.key === 'Backspace' && draft === '') {
      event.preventDefault();
      if (event.repeat) return;
      if (highlightedIndex !== null) removeAt(highlightedIndex);
      else if (tags.length > 0) highlight(tags.length - 1);
      return;
    }

    if (event.key === 'Delete' && highlightedIndex !== null) {
      event.preventDefault();
      if (event.repeat) return;
      removeAt(highlightedIndex);
      return;
    }

    if (event.key === 'ArrowLeft') {
      const { selectionStart, selectionEnd } = event.currentTarget;
      if (selectionStart !== 0 || selectionEnd !== 0 || tags.length === 0) return;
      event.preventDefault();
      highlight(highlightedIndex === null ? tags.length - 1 : Math.max(0, highlightedIndex - 1));
      return;
    }

    if (event.key === 'ArrowRight' && highlightedIndex !== null) {
      event.preventDefault();
      if (highlightedIndex >= tags.length - 1) setHighlighted(null);
      else highlight(highlightedIndex + 1);
      return;
    }

    if (event.key === 'Escape') {
      setHighlighted(null);
      setFocused(false);
      setActiveIndex(null);
    }
  }

  const chipKeys = useMemo(() => {
    const seen = new Map<string, number>();
    return tags.map((tag) => {
      const occurrence = seen.get(tag) ?? 0;
      seen.set(tag, occurrence + 1);
      return occurrence === 0 ? tag : `${tag}#${occurrence}`;
    });
  }, [tags]);

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {label ? (
        <Label htmlFor={inputId} className="text-sm font-medium text-foreground">
          {label} {labelHint ? <span className="text-muted-foreground">({labelHint})</span> : null}
        </Label>
      ) : null}
      <div>
        <ul
          ref={fieldRef}
          data-disabled={disabled || undefined}
          onPointerDown={(event) => {
            if (event.target !== event.currentTarget) return;
            event.preventDefault();
            inputRef.current?.focus();
          }}
          className="flex max-h-[116px] min-h-10 list-none flex-wrap items-center gap-1.5 overflow-y-auto overscroll-contain rounded-lg border border-input bg-background p-1.5 shadow-xs transition-[border-color,box-shadow] focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/25 focus-within:ring-offset-2 focus-within:ring-offset-background data-disabled:cursor-not-allowed data-disabled:bg-muted data-disabled:opacity-60 motion-reduce:transition-none"
        >
          {tags.map((tag, index) => {
            const lit = highlightedIndex === index || flashedTag === tag;
            return (
              <li
                key={chipKeys[index]}
                data-highlighted={lit || undefined}
                className={cn(
                  'flex h-6 min-w-0 max-w-full items-center gap-0.5 rounded-md border pl-2 text-xs transition-colors motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-reduce:transition-none',
                  lit
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-border bg-secondary text-secondary-foreground',
                )}
              >
                <span className="truncate">{tag}</span>
                <button
                  type="button"
                  disabled={disabled}
                  aria-label={`Remove ${tag}`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    removeAt(index);
                    inputRef.current?.focus();
                  }}
                  className={cn(
                    'grid size-5 shrink-0 place-items-center rounded-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none motion-reduce:transition-none',
                    lit
                      ? 'text-background/70 hover:text-background'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <X aria-hidden="true" className="size-3" />
                </button>
              </li>
            );
          })}
          <li className="flex h-6 min-w-24 flex-1">
            <input
              ref={inputRef}
              id={inputId}
              type="text"
              disabled={disabled}
              {...(hasSuggestions
                ? {
                    role: 'combobox',
                    'aria-controls': listboxId,
                    'aria-expanded': showMenu,
                    'aria-autocomplete': 'list' as const,
                    'aria-activedescendant':
                      showMenu && clampedActiveIndex !== null && menuItems.length > 0
                        ? `${listboxId}-option-${clampedActiveIndex}`
                        : undefined,
                  }
                : {})}
              aria-label={label ? undefined : 'Tags'}
              aria-describedby={hintId}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="done"
              value={draft}
              onChange={(event) => handleDraftChange(event.target.value)}
              onPaste={handlePaste}
              onFocus={() => {
                if (blurTimeoutRef.current !== null) {
                  window.clearTimeout(blurTimeoutRef.current);
                  blurTimeoutRef.current = null;
                }
                setFocused(true);
              }}
              onBlur={() => {
                setHighlighted(null);
                blurTimeoutRef.current = window.setTimeout(() => {
                  blurTimeoutRef.current = null;
                  setFocused(false);
                }, 120);
              }}
              onKeyDown={handleKeyDown}
              className="h-full w-full min-w-0 bg-transparent px-1 text-base text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed md:text-sm"
              placeholder={placeholder}
            />
          </li>
        </ul>

        {showMenu && menuRect ? (
          <div
            id={listboxId}
            role="listbox"
            className="fixed z-50 overflow-hidden rounded-popover border border-border bg-popover p-1.5 text-popover-foreground shadow-popover"
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
                    id={`${listboxId}-option-${index}`}
                    type="button"
                    role="option"
                    tabIndex={-1}
                    aria-selected={index === clampedActiveIndex}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => commit([item.value])}
                    className={cn(
                      'flex w-full items-center rounded-md px-3 py-2 text-left text-sm transition-colors motion-reduce:transition-none',
                      index === clampedActiveIndex
                        ? 'bg-accent text-accent-foreground'
                        : 'hover:bg-accent hover:text-accent-foreground',
                    )}
                  >
                    {item.label}
                  </button>
                ))
              ) : (
                <div className="px-2 py-3 text-center text-xs text-muted-foreground">
                  No matching tags
                </div>
              )}
            </div>
          </div>
        ) : null}

        <div className="mt-1.5 flex items-baseline justify-between gap-3 text-xs">
          <div className="grid min-w-0 flex-1">
            <p
              id={hintId}
              className={cn(
                'col-start-1 row-start-1 truncate text-muted-foreground transition-opacity motion-reduce:transition-none',
                rejection && 'opacity-0',
              )}
            >
              {hint}
            </p>
            <p
              aria-hidden="true"
              className={cn(
                'col-start-1 row-start-1 truncate text-foreground transition-opacity motion-reduce:transition-none',
                !rejection && 'opacity-0',
              )}
            >
              {rejection ? rejectionMessage(rejection, max) : null}
            </p>
          </div>
          {max === undefined ? null : (
            <p className="shrink-0 tabular-nums text-muted-foreground">
              <span className="inline-grid justify-items-end">
                <span aria-hidden="true" className="invisible col-start-1 row-start-1">
                  {max}
                </span>
                <span className="col-start-1 row-start-1">{tags.length}</span>
              </span>
              <span> / {max}</span>
            </p>
          )}
        </div>
      </div>

      {/* Portaled so modal dialogs can still hide this page: aria-hidden keeps
          every aria-live element and its ancestors exposed. */}
      {mounted
        ? createPortal(
            <span role="status" aria-live="polite" aria-atomic="true" className="sr-only">
              {announcement}
            </span>,
            document.body,
          )
        : null}
    </div>
  );
}
