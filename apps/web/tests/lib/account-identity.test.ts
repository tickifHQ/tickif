import { describe, expect, it } from 'vitest';
import { isGeneratedPhoneEmail, visibleAccountEmail } from '../../src/lib/account-identity';

describe('account identity helpers', () => {
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
