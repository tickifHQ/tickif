'use client';

import type { KeyboardEvent } from 'react';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Input } from '@repo/ui/components/input';
import { Label } from '@repo/ui/components/label';
import { cn } from '@repo/ui/lib/utils';

type ConfiguredApartment = {
  name: string;
  mark: string;
};

const configuredApartments = [
  { name: 'Casagrand First City', mark: 'CF' },
  { name: 'Maitri Apartments', mark: 'MA' },
  { name: 'Prestige Lakeside', mark: 'PL' },
  { name: 'Sea View', mark: 'SV' },
] as const satisfies readonly ConfiguredApartment[];

function normalizeApartmentName(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

function apartmentForName(value: string) {
  const normalizedValue = normalizeApartmentName(value);
  if (!normalizedValue) return null;

  return (
    configuredApartments.find(
      (apartment) => normalizeApartmentName(apartment.name) === normalizedValue,
    ) ?? null
  );
}

function ApartmentMark({ apartment }: { apartment: ConfiguredApartment }) {
  return (
    <span
      role="img"
      aria-label={`${apartment.name} logo`}
      className="inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-[10px] font-semibold tracking-wide text-primary"
    >
      {apartment.mark}
    </span>
  );
}

export function ApartmentNameCombobox({
  id,
  label,
  onChange,
  placeholder,
  value,
}: {
  id: string;
  label: string;
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  const listboxId = useId();
  const customHintId = useId();
  const controlRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [menuRect, setMenuRect] = useState<{
    bottom?: number;
    left: number;
    maxHeight: number;
    top?: number;
    width: number;
  } | null>(null);
  const selectedApartment = apartmentForName(value);
  const filteredApartments = useMemo(() => {
    const query = normalizeApartmentName(value);
    if (!query || selectedApartment) return [...configuredApartments];

    return configuredApartments.filter((apartment) =>
      normalizeApartmentName(apartment.name).includes(query),
    );
  }, [selectedApartment, value]);
  const clampedActiveIndex = Math.min(activeIndex, Math.max(filteredApartments.length - 1, 0));
  const isCustomName =
    value.trim().length > 0 && selectedApartment === null && filteredApartments.length === 0;

  const updateMenuRect = useCallback(() => {
    const rect = controlRef.current?.getBoundingClientRect();
    if (!rect) return;

    const viewportPadding = 8;
    const gap = 4;
    const preferredHeight = 224;
    const roomBelow = window.innerHeight - rect.bottom - viewportPadding - gap;
    const roomAbove = rect.top - viewportPadding - gap;
    const openAbove = roomBelow < 144 && roomAbove > roomBelow;
    const availableHeight = openAbove ? roomAbove : roomBelow;
    const width = Math.min(rect.width, window.innerWidth - viewportPadding * 2);
    const left = Math.min(
      Math.max(rect.left, viewportPadding),
      window.innerWidth - width - viewportPadding,
    );

    setMenuRect({
      ...(openAbove ? { bottom: window.innerHeight - rect.top + gap } : { top: rect.bottom + gap }),
      left,
      maxHeight: Math.max(96, Math.min(preferredHeight, availableHeight)),
      width,
    });
  }, []);

  useEffect(() => {
    if (!open) {
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
  }, [open, updateMenuRect, value]);

  function selectApartment(apartment: ConfiguredApartment) {
    onChange(apartment.name);
    setOpen(false);
    setActiveIndex(0);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) =>
        filteredApartments.length === 0 ? 0 : Math.min(current + 1, filteredApartments.length - 1),
      );
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => Math.max(current - 1, 0));
      return;
    }

    if (event.key === 'Enter' && open && filteredApartments.length > 0) {
      event.preventDefault();
      selectApartment(filteredApartments[clampedActiveIndex]!);
      return;
    }

    if (event.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div
      className="space-y-1.5"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <Label htmlFor={id} className="text-[13px] leading-[1.6] font-medium text-foreground">
        {label}
      </Label>
      <div ref={controlRef} className="relative">
        {selectedApartment ? (
          <span className="pointer-events-none absolute top-1/2 left-2.5 z-10 -translate-y-1/2">
            <ApartmentMark apartment={selectedApartment} />
          </span>
        ) : null}
        <Input
          id={id}
          role="combobox"
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-expanded={open}
          aria-activedescendant={
            open && filteredApartments.length > 0
              ? `${listboxId}-option-${clampedActiveIndex}`
              : undefined
          }
          aria-describedby={isCustomName ? customHintId : undefined}
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
            setOpen(true);
            setActiveIndex(0);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={cn('text-[13px] leading-[1.1]', selectedApartment ? 'pr-9 pl-11' : 'pr-9')}
        />
        <ChevronsUpDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />

        {open && menuRect ? (
          <div
            id={listboxId}
            role="listbox"
            className="fixed z-50 overflow-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-lg"
            style={{
              bottom: menuRect.bottom,
              left: menuRect.left,
              maxHeight: menuRect.maxHeight,
              top: menuRect.top,
              width: menuRect.width,
            }}
          >
            <div className="max-h-full overflow-y-auto">
              {filteredApartments.length > 0 ? (
                filteredApartments.map((apartment, index) => {
                  const selected = selectedApartment?.name === apartment.name;
                  return (
                    <button
                      key={apartment.name}
                      id={`${listboxId}-option-${index}`}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => selectApartment(apartment)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-sm px-2 py-2 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground',
                        index === clampedActiveIndex && 'bg-accent text-accent-foreground',
                      )}
                    >
                      <ApartmentMark apartment={apartment} />
                      <span className="min-w-0 flex-1 truncate">{apartment.name}</span>
                      {selected ? <Check className="size-4 shrink-0 text-primary" /> : null}
                    </button>
                  );
                })
              ) : (
                <p className="px-3 py-2 text-xs text-muted-foreground">
                  No configured apartment found.
                </p>
              )}
            </div>
          </div>
        ) : null}
      </div>
      {isCustomName ? (
        <p id={customHintId} className="text-xs leading-[1.6] text-muted-foreground">
          No configured apartment found. You can keep this custom apartment name.
        </p>
      ) : null}
    </div>
  );
}
