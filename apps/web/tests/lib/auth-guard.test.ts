import { describe, expect, it } from 'vitest';
import { rolePassesCheck } from '../../src/lib/auth-guard';

describe('rolePassesCheck', () => {
  it.each([
    // superadmin passes every check
    ['superadmin', 'superadmin', true],
    ['superadmin', 'admin', true],
    ['superadmin', 'designer', true],
    // admin passes admin + designer, not superadmin
    ['admin', 'admin', true],
    ['admin', 'designer', true],
    ['admin', 'superadmin', false],
    // designer passes designer only
    ['designer', 'designer', true],
    ['designer', 'admin', false],
    ['designer', 'superadmin', false],
    // unknown role never passes
    ['bogus', 'designer', false],
  ] as const)('role %s vs required %s → %s', (userRole, requiredRole, expected) => {
    expect(rolePassesCheck(userRole, requiredRole)).toBe(expected);
  });

  it('null role fails every check', () => {
    expect(rolePassesCheck(null, 'designer')).toBe(false);
    expect(rolePassesCheck(null, 'admin')).toBe(false);
    expect(rolePassesCheck(null, 'superadmin')).toBe(false);
  });
});
