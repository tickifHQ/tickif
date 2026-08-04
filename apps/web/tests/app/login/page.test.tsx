import { describe, expect, it } from 'vitest';
import { safeCallbackPath } from '../../../app/login/page';

describe('login callback path', () => {
  it('accepts an application-relative path', () => {
    expect(safeCallbackPath('/invitations/invitation-1')).toBe('/invitations/invitation-1');
  });

  it.each(['https://example.com', '//example.com', '/\\example.com'])(
    'rejects unsafe callback value %s',
    (value) => {
      expect(safeCallbackPath(value)).toBeUndefined();
    },
  );
});
