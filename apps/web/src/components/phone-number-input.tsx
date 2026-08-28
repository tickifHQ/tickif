'use client';

import { useRef, useState } from 'react';
import { countries as allCountries } from 'country-codes-flags-phone-codes';
import parsePhoneNumber, {
  getExampleNumber,
  isSupportedCountry,
  type CountryCode,
} from 'libphonenumber-js/max';
import mobilePhoneExamples from 'libphonenumber-js/examples.mobile.json';
import { ChevronDown } from 'lucide-react';
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
  isoCode: CountryCode;
  name: string;
}

export const countries: Country[] = allCountries
  .filter(
    (country): country is typeof country & { code: CountryCode; dialCode: string } =>
      Boolean(country.dialCode) && isSupportedCountry(country.code),
  )
  .map((country) => ({
    code: country.dialCode,
    flag: country.flag,
    isoCode: country.code,
    name: country.name,
  }))
  .sort((a, b) => {
    if (a.name === 'India') return -1;
    if (b.name === 'India') return 1;
    return a.name.localeCompare(b.name);
  });

const countryByIsoCode = new Map(countries.map((country) => [country.isoCode, country]));
const MAX_E164_DIGITS = 15;

const maxNationalDigitsByCountry = new Map(
  countries.map((country) => {
    const dialCodeLength = country.code.replace(/\D/g, '').length;
    // OTP verification requires a mobile number, so derive the cap from the
    // library's mobile numbering-plan data rather than the general E.164 limit.
    const example = getExampleNumber(country.isoCode, mobilePhoneExamples);
    const maximum = example?.nationalNumber.length ?? MAX_E164_DIGITS - dialCodeLength;
    return [country.isoCode, Math.min(maximum, MAX_E164_DIGITS - dialCodeLength)] as const;
  }),
);

function maxNationalPhoneDigits(country: Country): number {
  return (
    maxNationalDigitsByCountry.get(country.isoCode) ??
    MAX_E164_DIGITS - country.code.replace(/\D/g, '').length
  );
}

function limitNationalPhoneDigits(country: Country, phone: string): string {
  return phone.slice(0, maxNationalPhoneDigits(country));
}

export function normalizePhoneInput(
  value: string,
  selectedCountry: Country,
): { country: Country; phone: string } {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, '');

  if (!digits) return { country: selectedCountry, phone: '' };

  if (trimmed.startsWith('+')) {
    const international = parsePhoneNumber(trimmed);
    const detectedCountry = international?.country
      ? countryByIsoCode.get(international.country)
      : undefined;

    if (international?.isPossible() && detectedCountry) {
      return {
        country: detectedCountry,
        phone: limitNationalPhoneDigits(detectedCountry, international.nationalNumber),
      };
    }
  }

  const local = parsePhoneNumber(digits, selectedCountry.isoCode);
  const selectedDialDigits = selectedCountry.code.replace(/\D/g, '');

  if (
    local?.isPossible() &&
    digits.startsWith(selectedDialDigits) &&
    digits.length > local.nationalNumber.length
  ) {
    return {
      country: selectedCountry,
      phone: limitNationalPhoneDigits(selectedCountry, local.nationalNumber),
    };
  }

  if (!local?.isPossible() && digits.startsWith(selectedDialDigits)) {
    const international = parsePhoneNumber(`+${digits}`);
    if (international?.isPossible() && international.countryCallingCode === selectedDialDigits) {
      const detectedCountry =
        countryByIsoCode.get(international.country ?? selectedCountry.isoCode) ?? selectedCountry;
      return {
        country: detectedCountry,
        phone: limitNationalPhoneDigits(detectedCountry, international.nationalNumber),
      };
    }
  }

  return {
    country: selectedCountry,
    phone: limitNationalPhoneDigits(selectedCountry, digits),
  };
}

export function toE164PhoneNumber(country: Country, phone: string): string | null {
  const trimmed = phone.trim();
  if (!trimmed) return null;

  const parsed = trimmed.startsWith('+')
    ? parsePhoneNumber(trimmed)
    : parsePhoneNumber(trimmed.replace(/\D/g, ''), country.isoCode);

  if (!parsed?.isValid()) return null;

  const selectedDialDigits = country.code.replace(/\D/g, '');
  return parsed.countryCallingCode === selectedDialDigits ? parsed.number : null;
}

type PhoneNumberInputProps = {
  ariaDescribedBy?: string;
  ariaInvalid?: boolean;
  ariaLabel?: string;
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
  showDialCode?: boolean;
  wrapperClassName?: string;
};

export function PhoneNumberInput({
  ariaDescribedBy,
  ariaInvalid,
  ariaLabel = 'Phone number',
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
  showDialCode = true,
  wrapperClassName,
}: PhoneNumberInputProps) {
  const [countrySearch, setCountrySearch] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  const filteredCountries = countrySearch
    ? countries.filter((country) => {
        const query = countrySearch.toLowerCase();
        return (
          country.name.toLowerCase().includes(query) || country.code.toLowerCase().includes(query)
        );
      })
    : countries;

  function handlePhoneChange(event: React.ChangeEvent<HTMLInputElement>) {
    const normalized = normalizePhoneInput(event.target.value, selectedCountry);
    if (normalized.country.isoCode !== selectedCountry.isoCode) {
      onSelectedCountryChange(normalized.country);
    }
    onPhoneChange(normalized.phone);
  }

  function handleCountryChange(country: Country) {
    onSelectedCountryChange(country);
    onPhoneChange(limitNationalPhoneDigits(country, phone));
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
            aria-label={`Country code, ${selectedCountry.name} ${selectedCountry.code}`}
          >
            <span className="text-base leading-none">{selectedCountry.flag}</span>
            {showDialCode ? selectedCountry.code : null}
            <ChevronDown className="size-3.5 shrink-0 opacity-60" aria-hidden="true" />
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
                onSelect={() => handleCountryChange(country)}
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
        aria-label={ariaLabel}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
        type="tel"
        inputMode="numeric"
        maxLength={maxNationalPhoneDigits(selectedCountry)}
        placeholder={placeholder}
        value={phone}
        onChange={handlePhoneChange}
        onKeyDown={(event) => {
          if (event.key === 'Enter') onEnter?.();
        }}
        className={cn('-ml-px rounded-l-none', inputClassName)}
        disabled={disabled}
        autoComplete="tel-national"
      />
    </div>
  );
}
