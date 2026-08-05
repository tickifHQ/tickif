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
