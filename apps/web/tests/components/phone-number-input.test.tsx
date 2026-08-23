import { describe, expect, it } from 'vitest';
import {
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
});
