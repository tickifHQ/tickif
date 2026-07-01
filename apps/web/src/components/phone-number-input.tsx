'use client';

import { useRef, useState } from 'react';
import { countries as allCountries } from 'country-codes-flags-phone-codes';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@repo/ui/components/dropdown-menu';
import { Input } from '@repo/ui/components/input';
import { cn } from '@repo/ui/lib/utils';

export interface Country {
  code: string;
  flag: string;
  name: string;
}

export const countries: Country[] = allCountries
  .filter((c) => c.dialCode)
  .map((c) => ({ code: c.dialCode, flag: c.flag, name: c.name }))
  .sort((a, b) => {
    if (a.name === 'India') return -1;
    if (b.name === 'India') return 1;
    return a.name.localeCompare(b.name);
  });

type PhoneNumberInputProps = {
  countryButtonClassName?: string;
  disabled?: boolean;
  id: string;
  inputClassName?: string;
  onEnter?: () => void;
  onPhoneChange: (phone: string) => void;
  onSelectedCountryChange: (country: Country) => void;
  phone: string;
  placeholder?: string;
  selectedCountry: Country;
  wrapperClassName?: string;
};

export function PhoneNumberInput({
  countryButtonClassName,
  disabled = false,
  id,
  inputClassName,
  onEnter,
  onPhoneChange,
  onSelectedCountryChange,
  phone,
  placeholder = '9876543210',
  selectedCountry,
  wrapperClassName,
}: PhoneNumberInputProps) {
  const [countrySearch, setCountrySearch] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  const filteredCountries = countrySearch
    ? countries.filter((country) => {
        const query = countrySearch.toLowerCase();
        return (
          country.name.toLowerCase().includes(query) ||
          country.code.toLowerCase().includes(query)
        );
      })
    : countries;

  function handlePhoneChange(event: React.ChangeEvent<HTMLInputElement>) {
    const digits = event.target.value.replace(/\D/g, '').slice(0, 10);
    onPhoneChange(digits);
  }

  return (
    <div className={cn('flex', wrapperClassName)}>
      <DropdownMenu
        onOpenChange={(open) => {
          if (!open) setCountrySearch('');
        }}
      >
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              'inline-flex items-center gap-2 rounded-l-md border border-r-0 border-input bg-muted px-2.5 py-2 text-sm text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              countryButtonClassName,
            )}
            disabled={disabled}
          >
            <span className="text-base leading-none">{selectedCountry.flag}</span>
            {selectedCountry.code}
            <svg
              className="size-3.5 shrink-0 opacity-60"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          sideOffset={2}
          collisionPadding={8}
          className="max-h-60 max-w-[calc(100vw-1rem)] overflow-y-auto"
        >
          <div className="sticky top-0 z-10 -mx-1 -mt-1 mb-1 bg-popover px-1 pt-1 shadow-sm">
            <input
              ref={searchRef}
              type="text"
              placeholder="Search countries..."
              value={countrySearch}
              onChange={(event) => setCountrySearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  if (countrySearch) {
                    event.preventDefault();
                    setCountrySearch('');
                    return;
                  }
                  return;
                }
                event.stopPropagation();
              }}
              className="w-full rounded-sm border border-input bg-background px-2 py-1.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
              autoFocus
            />
          </div>
          {filteredCountries.length > 0 ? (
            filteredCountries.map((country) => (
              <DropdownMenuItem
                key={`${country.code}-${country.name}`}
                onSelect={() => onSelectedCountryChange(country)}
                className="gap-2"
              >
                <span className="text-base leading-none">{country.flag}</span>
                <span className="text-muted-foreground">{country.code}</span>
                <span className="text-foreground">{country.name}</span>
              </DropdownMenuItem>
            ))
          ) : (
            <div className="px-2 py-4 text-center text-xs text-muted-foreground">
              No countries found
            </div>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <Input
        id={id}
        type="tel"
        inputMode="numeric"
        placeholder={placeholder}
        value={phone}
        onChange={handlePhoneChange}
        onKeyDown={(event) => {
          if (event.key === 'Enter') onEnter?.();
        }}
        className={cn('-ml-px rounded-l-none', inputClassName)}
        disabled={disabled}
        autoComplete="tel"
      />
    </div>
  );
}
