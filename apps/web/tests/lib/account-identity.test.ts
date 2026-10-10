import { describe, expect, it } from 'vitest';
import {
  isGeneratedPhoneEmail,
  visibleAccountEmail,
  visibleAccountName,
} from '../../src/lib/account-identity';

describe('account identity helpers', () => {
  it.each([null, undefined, '', '   '])('hides a missing display name: %s', (name) => {
    expect(visibleAccountName(name, '+919876543210')).toBeNull();
  });

  it.each(['+919876543210', '919876543210', '+91 (98765) 43210', '  +91-98765-43210  '])(
    'hides the phone-auth placeholder even when its formatting differs: %s',
    (name) => expect(visibleAccountName(name, '+919876543210')).toBeNull(),
  );

  it.each([
    ['  Alice R  ', '+919876543210', 'Alice R'],
    ['Alice 919876543210', '+919876543210', 'Alice 919876543210'],
    ['1234', '+919876543210', '1234'],
    ['Alice', null, 'Alice'],
    ['Alice', undefined, 'Alice'],
  ])('preserves a genuine name %s', (name, phone, expected) => {
    expect(visibleAccountName(name, phone)).toBe(expected);
  });

  it.each(['+91981000001@phone.tickif.local', '+91981000001@PHONE.TICKIF.LOCAL'])(
    'flags a generated phone identity %s',
    (email) => {
      expect(isGeneratedPhoneEmail(email)).toBe(true);
      expect(visibleAccountEmail(email)).toBeNull();
    },
  );

  it.each(['mahi@test.com', null, undefined, ''])('does not flag %s as generated', (email) => {
    expect(isGeneratedPhoneEmail(email)).toBe(false);
  });

  it('keeps a real login email visible', () => {
    expect(visibleAccountEmail('mahi@test.com')).toBe('mahi@test.com');
  });

  it('hides a missing email', () => {
    expect(visibleAccountEmail(null)).toBeNull();
    expect(visibleAccountEmail(undefined)).toBeNull();
  });
});
