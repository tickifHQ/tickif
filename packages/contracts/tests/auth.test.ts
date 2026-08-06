import { describe, expect, it } from 'vitest';
import {
  ADMIN_PLATFORM_ROLES,
  PLATFORM_ROLE,
  PLATFORM_ROLE_VALUES,
  platformRoleSchema,
} from '../src/auth';

describe('platformRoleSchema', () => {
  it('accepts every canonical platform role', () => {
    for (const role of PLATFORM_ROLE_VALUES) {
      expect(platformRoleSchema.safeParse(role).success).toBe(true);
    }
  });

  it('rejects unknown and organization-scoped roles', () => {
    expect(platformRoleSchema.safeParse('owner').success).toBe(false);
    expect(platformRoleSchema.safeParse('member').success).toBe(false);
    expect(platformRoleSchema.safeParse('unknown').success).toBe(false);
  });

  it('keeps the privileged Better Auth roles explicit', () => {
    expect(ADMIN_PLATFORM_ROLES).toEqual([PLATFORM_ROLE.ADMIN, PLATFORM_ROLE.SUPERADMIN]);
  });
});
