'use client';

import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '../lib/utils';
import { Button } from './button';
import { Input } from './input';
import { Label } from './label';

const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

type MonthPickerFieldProps = {
  className?: string;
  helperText?: string;
  label: string;
  maxYear?: number;
  minYear?: number;
  onChange: (value: string) => void;
  placeholder?: string;
  value: string;
};

function parseYear(value: string, fallbackYear: number) {
  const match = /^(\d{4})-\d{2}$/.exec(value);
  if (!match) return fallbackYear;
  return Number(match[1]);
}

function formatMonthValue(year: number, monthIndex: number) {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
}

export function MonthPickerField({
  className,
  helperText,
  label,
  maxYear = new Date().getFullYear() + 1,
  minYear = 1990,
  onChange,
  placeholder = 'YYYY-MM',
  value,
}: MonthPickerFieldProps) {
  const currentYear = new Date().getFullYear();
  const [open, setOpen] = useState(false);
  const [visibleYear, setVisibleYear] = useState(() => parseYear(value, currentYear));
  const containerRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const [pickerRect, setPickerRect] = useState<{ left: number; top: number; width: number } | null>(null);
  const selectedValue = useMemo(() => value.trim(), [value]);

  const updatePickerRect = useCallback(() => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPickerRect({
      left: rect.left,
      top: rect.bottom + 4,
      width: Math.max(rect.width, 256),
    });
  }, []);

  useEffect(() => {
    if (!open) return;

    setVisibleYear(parseYear(value, currentYear));
    updatePickerRect();

    function closeOnOutsidePointerDown(event: PointerEvent) {
      if (containerRef.current?.contains(event.target as Node)) return;
      if (pickerRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      setOpen(false);
    }

    document.addEventListener('pointerdown', closeOnOutsidePointerDown);
    document.addEventListener('keydown', closeOnEscape);
    window.addEventListener('resize', updatePickerRect);
    window.addEventListener('scroll', updatePickerRect, true);

    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointerDown);
      document.removeEventListener('keydown', closeOnEscape);
      window.removeEventListener('resize', updatePickerRect);
      window.removeEventListener('scroll', updatePickerRect, true);
    };
  }, [currentYear, open, updatePickerRect, value]);

  function selectMonth(monthIndex: number) {
    onChange(formatMonthValue(visibleYear, monthIndex));
    setOpen(false);
  }

  return (
    <div className={cn('space-y-1.5', className)}>
      <Label className="text-sm font-medium text-foreground">{label}</Label>
      <div ref={containerRef} className="relative">
        <Input
          type="month"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onClick={() => setOpen(true)}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className={cn('cursor-pointer', selectedValue && 'pr-10')}
          aria-expanded={open}
          aria-haspopup="dialog"
        />
        {selectedValue ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1/2 size-8 -translate-y-1/2"
            onClick={(event) => {
              event.stopPropagation();
              onChange('');
              setOpen(false);
            }}
            aria-label={`Clear ${label}`}
          >
            <X className="size-4" />
          </Button>
        ) : null}
        {open && pickerRect ? (
          <div
            ref={pickerRef}
            role="dialog"
            aria-label={`${label} month picker`}
            className="fixed z-50 rounded-md border border-border bg-popover p-3 text-popover-foreground shadow-lg"
            style={{ left: pickerRect.left, top: pickerRect.top, width: pickerRect.width }}
            onMouseDown={(event) => event.preventDefault()}
          >
            <div className="flex items-center justify-between gap-2">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8"
                disabled={visibleYear <= minYear}
                onClick={() => setVisibleYear((year) => Math.max(year - 1, minYear))}
                aria-label="Previous year"
              >
                <ChevronLeft className="size-4" />
              </Button>
              <div className="text-sm font-medium text-foreground">{visibleYear}</div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8"
                disabled={visibleYear >= maxYear}
                onClick={() => setVisibleYear((year) => Math.min(year + 1, maxYear))}
                aria-label="Next year"
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-1">
              {monthLabels.map((month, index) => {
                const monthValue = formatMonthValue(visibleYear, index);
                const selected = monthValue === selectedValue;

                return (
                  <button
                    key={month}
                    type="button"
                    onClick={() => selectMonth(index)}
                    className={cn(
                      'rounded-md px-3 py-2 text-sm font-medium transition-colors',
                      selected
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                    )}
                  >
                    {month}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
      {helperText ? <p className="text-sm text-muted-foreground">{helperText}</p> : null}
    </div>
  );
}
