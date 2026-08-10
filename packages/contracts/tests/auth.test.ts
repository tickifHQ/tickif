import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_STATUS,
  ACCOUNT_STATUS_VALUES,
  ADMIN_PLATFORM_ROLES,
  PLATFORM_ROLE,
  PLATFORM_ROLE_VALUES,
  accountStatusSchema,
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

describe('accountStatusSchema', () => {
  it('accepts only the canonical app-owned account lifecycle values', () => {
    for (const status of ACCOUNT_STATUS_VALUES) {
      expect(accountStatusSchema.safeParse(status).success).toBe(true);
    }
    expect(accountStatusSchema.safeParse('disabled').success).toBe(false);
    expect(ACCOUNT_STATUS_VALUES).toEqual([
      ACCOUNT_STATUS.PENDING,
      ACCOUNT_STATUS.ACTIVE,
      ACCOUNT_STATUS.SUSPENDED,
      ACCOUNT_STATUS.DELETED,
    ]);
  });
});
