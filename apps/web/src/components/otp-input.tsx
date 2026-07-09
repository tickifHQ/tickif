'use client';

import { useEffect, useRef } from 'react';
import { Input } from '@repo/ui/components/input';

interface OtpInputProps {
  value: string[];
  onChange: (value: string[]) => void;
  onComplete?: () => void;
  disabled?: boolean;
  length?: number;
}

export function OtpInput({
  value,
  onChange,
  onComplete,
  disabled = false,
  length = 6,
}: OtpInputProps) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  function handleChange(index: number, inputValue: string) {
    const digits = inputValue.replace(/\D/g, '');

    // Multi-character input (e.g., iOS OTP autofill)
    if (digits.length > 1) {
      const next = [...value];
      for (let i = 0; i < length; i++) {
        next[i] = digits[i] ?? next[i] ?? '';
      }
      onChange(next);
      const focusIndex = Math.min(digits.length, length - 1);
      inputRefs.current[focusIndex]?.focus();
      return;
    }

    // Single digit typed
    const digit = digits.slice(0, 1);
    if (digit && digit !== value[index]) {
      const next = [...value];
      next[index] = digit;
      onChange(next);
      if (index < length - 1) {
        inputRefs.current[index + 1]?.focus();
      }
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (!pasted) return;
    const next = [...value];
    for (let i = 0; i < length; i++) {
      next[i] = pasted[i] ?? '';
    }
    onChange(next);
    const focusIndex = Math.min(pasted.length, length - 1);
    inputRefs.current[focusIndex]?.focus();
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace') {
      e.preventDefault();
      const next = [...value];
      if (value[index]) {
        next[index] = '';
        onChange(next);
      } else if (index > 0) {
        next[index - 1] = '';
        onChange(next);
        inputRefs.current[index - 1]?.focus();
      }
      return;
    }
    if (e.key === 'Enter' && value.every((d) => d)) {
      onComplete?.();
    }
  }

  return (
    <div className="flex w-full justify-center gap-1.5 px-2">
      {Array.from({ length }, (_, i) => (
        <Input
          key={i}
          ref={(el) => {
            inputRefs.current[i] = el;
          }}
          type="text"
          inputMode="numeric"
          maxLength={length}
          value={value[i] ?? ''}
          aria-label={`OTP digit ${i + 1}`}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          onFocus={(e) => e.target.select()}
          className="h-12 min-w-0 flex-1 rounded-lg text-center text-xl font-medium"
          disabled={disabled}
          autoComplete="one-time-code"
        />
      ))}
    </div>
  );
}
