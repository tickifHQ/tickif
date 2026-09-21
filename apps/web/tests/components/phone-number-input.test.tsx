import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  PhoneNumberInput,
  countries,
  normalizePhoneInput,
  toE164PhoneNumber,
} from '../../src/components/phone-number-input';

function country(name: string) {
  const match = countries.find((item) => item.name === name);
  if (!match) throw new Error(`Missing country fixture: ${name}`);
  return match;
}

describe('phone number normalization', () => {
  it('validates national numbers using the selected country', () => {
    expect(toE164PhoneNumber(country('India'), '9876543210')).toBe('+919876543210');
    expect(toE164PhoneNumber(country('Australia'), '0412345678')).toBe('+61412345678');
    expect(toE164PhoneNumber(country('United Kingdom'), '07123456789')).toBe('+447123456789');
    expect(toE164PhoneNumber(country('India'), '12345')).toBeNull();
  });

  it('extracts the country and national number from a pasted international number', () => {
    expect(normalizePhoneInput('+61 412 345 678', country('India'))).toEqual({
      country: country('Australia'),
      phone: '412345678',
    });
  });

  it('does not duplicate a selected dial code pasted without a plus sign', () => {
    expect(normalizePhoneInput('919876543210', country('India'))).toEqual({
      country: country('India'),
      phone: '9876543210',
    });
  });

  it('limits Indian mobile input to ten national digits', () => {
    expect(normalizePhoneInput('9876543210123', country('India'))).toEqual({
      country: country('India'),
      phone: '9876543210',
    });
    expect(normalizePhoneInput('+91 9876543210123', country('India'))).toEqual({
      country: country('India'),
      phone: '9876543210',
    });
  });

  it('uses each country numbering plan instead of only the E.164 ceiling', () => {
    expect(normalizePhoneInput('2025550123456', country('United States'))).toEqual({
      country: country('United States'),
      phone: '2025550123',
    });
  });
});

describe('PhoneNumberInput focus treatment', () => {
  it('keeps one visible focus ring around both keyboard-focusable parts', async () => {
    const user = userEvent.setup();
    const india = country('India');

    render(
      <PhoneNumberInput
        id="phone"
        phone=""
        selectedCountry={india}
        onPhoneChange={() => undefined}
        onSelectedCountryChange={() => undefined}
      />,
    );

    const selector = screen.getByRole('button', { name: /Country code, India/ });
    const number = screen.getByRole('textbox', { name: 'Phone number' });
    const group = number.closest('[data-slot="phone-number-input"]');

    expect(group).toHaveClass(
      'focus-within:outline-2',
      'focus-within:outline-ring',
      'focus-within:-outline-offset-2',
    );
    expect(selector).toHaveClass('focus-visible:ring-0');
    expect(number).toHaveClass('focus-visible:ring-0');

    await user.tab();
    expect(selector).toHaveFocus();
    await user.tab();
    expect(number).toHaveFocus();
  });

  it('marks the whole phone field invalid without hiding the input error state', () => {
    render(
      <PhoneNumberInput
        id="invalid-phone"
        phone="123"
        selectedCountry={country('India')}
        onPhoneChange={() => undefined}
        onSelectedCountryChange={() => undefined}
        ariaInvalid
      />,
    );

    const number = screen.getByRole('textbox', { name: 'Phone number' });
    expect(number).toHaveAttribute('aria-invalid', 'true');
    expect(number.closest('[data-slot="phone-number-input"]')).toHaveAttribute(
      'data-invalid',
      'true',
    );
  });
});
