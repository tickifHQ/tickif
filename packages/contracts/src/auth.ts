import { z } from 'zod';

/** Closed platform-role set shared by auth, persistence, API, and web authorization. */
export const PLATFORM_ROLE = {
  VISITOR: 'visitor',
  DESIGNER: 'designer',
  ADMIN: 'admin',
  SUPERADMIN: 'superadmin',
} as const;

export const PLATFORM_ROLE_VALUES = [
  PLATFORM_ROLE.VISITOR,
  PLATFORM_ROLE.DESIGNER,
  PLATFORM_ROLE.ADMIN,
  PLATFORM_ROLE.SUPERADMIN,
] as const;

export const platformRoleSchema = z.enum(PLATFORM_ROLE_VALUES).meta({ id: 'PlatformRole' });
export type PlatformRole = z.infer<typeof platformRoleSchema>;

export const ADMIN_PLATFORM_ROLES = [
  PLATFORM_ROLE.ADMIN,
  PLATFORM_ROLE.SUPERADMIN,
] as const satisfies readonly PlatformRole[];

/** App-owned account lifecycle, separate from Better Auth's platform role. */
export const ACCOUNT_STATUS = {
  PENDING: 'pending',
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  DELETED: 'deleted',
} as const;

export const ACCOUNT_STATUS_VALUES = [
  ACCOUNT_STATUS.PENDING,
  ACCOUNT_STATUS.ACTIVE,
  ACCOUNT_STATUS.SUSPENDED,
  ACCOUNT_STATUS.DELETED,
] as const;

export const accountStatusSchema = z.enum(ACCOUNT_STATUS_VALUES).meta({ id: 'AccountStatus' });
export type AccountStatus = z.infer<typeof accountStatusSchema>;
