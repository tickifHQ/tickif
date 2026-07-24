import { describe, expect, it } from 'vitest';
import { isPublicPath } from '../proxy';

describe('isPublicPath', () => {
  it('allows public designer profile routes', () => {
    expect(isPublicPath('/d/anika-spaces')).toBe(true);
  });

  it('does not treat similarly prefixed protected routes as public', () => {
    expect(isPublicPath('/designer/dashboard')).toBe(false);
    expect(isPublicPath('/d')).toBe(false);
  });
});
